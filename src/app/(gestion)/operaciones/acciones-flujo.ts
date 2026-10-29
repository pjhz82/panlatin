"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cambios, cuentas, operaciones, partidas } from "@/db/schema";
import { requerirUsuario, type UsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { fotoOperacion, firmarCambioEnTx, validarCambio } from "@/lib/cambios";
import { firmaDelCreador, requiereAprobacion, revertirPartidaEnTx } from "@/lib/ejecucion";
import { esquemaCambio, esquemaPartidas } from "@/lib/esquemas-operacion";
import type { EstadoFormulario } from "@/lib/formularios";
import {
  avisoLimite,
  cerrarPartidaEnTx,
  pagoAlBalanceEnTx,
  partidaAlBalanceEnTx,
  reportarPagoEnTx,
  revertirBalancePagoEnTx,
  revertirBalancePartidaEnTx,
  revertirPagoEnTx,
} from "@/lib/pagos";
import { leerImporte } from "@/lib/importes";

const fecha = z.iso.date("Pon la fecha.");
const texto = (fd: FormData, campo: string, max = 300) => String(fd.get(campo) ?? "").trim().slice(0, max) || null;

/** Tras cualquier paso del flujo cambian las bandejas, el seguimiento y los saldos. */
const refrescar = () => revalidatePath("/", "layout");

/** Ejecuta un paso en una transacción y convierte errores en un mensaje para el formulario. */
async function paso<R extends object>(
  hacer: () => Promise<R>,
  auditar: (r: Exclude<R, { error: string }>) => { usuario: UsuarioActual; entidadId: number; detalle: unknown },
  mensaje?: string,
): Promise<EstadoFormulario> {
  let r: R;
  try {
    r = await hacer();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado." };
  }
  if ("error" in r && typeof r.error === "string") return { error: r.error };
  const a = auditar(r as Exclude<R, { error: string }>);
  await registrarAuditoria({ usuarioId: a.usuario.id, accion: "editar", entidad: "operacion", entidadId: a.entidadId, detalle: a.detalle });
  refrescar();
  return { ok: true, mensaje };
}

// ——— Módulo 2: pagos (administradora) ———

export async function reportarPago(partidaId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const f = fecha.safeParse(String(fd.get("fecha") ?? ""));
  if (!f.success) return { error: "Pon la fecha del pago." };
  const cuentaId = Number(fd.get("cuentaId"));
  if (!Number.isInteger(cuentaId) || cuentaId <= 0) return { error: "Elige la cuenta de la que salió o a la que entró." };
  const monto = leerImporte(String(fd.get("monto") ?? ""));
  if (!(monto > 0)) return { error: "Pon el monto del pago (sin signo)." };
  const datos = {
    cuentaId,
    fecha: f.data,
    monto,
    referencia: texto(fd, "referencia", 200),
    interbancario: fd.get("interbancario") === "on",
    nota: texto(fd, "nota", 500),
    usuarioId: usuario.id,
  };
  const aviso = datos.interbancario ? await avisoLimite(cuentaId, datos.fecha, monto) : null;
  return paso(
    () => db.transaction((tx) => reportarPagoEnTx(tx, partidaId, datos)),
    (r) => ({ usuario, entidadId: r.operacionId, detalle: { reportaPago: r.pagoId, partidaId, ...datos } }),
    aviso ? `Pago reportado. ${aviso}` : "Pago reportado.",
  );
}

export async function revertirPago(pagoId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const motivo = texto(fd, "motivo", 500);
  if (!motivo) return { error: "Explica qué estaba mal en el pago." };
  return paso(
    () => db.transaction((tx) => revertirPagoEnTx(tx, pagoId)),
    (r) => ({ usuario, entidadId: r.operacionId, detalle: { reviertePago: r.pago, movimientos: r.borrados, motivo } }),
    "Pago revertido. Ya puedes reportarlo bien.",
  );
}

export async function cerrarPartida(partidaId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const nota = texto(fd, "nota", 500);
  if (!nota) return { error: "Explica por qué se cierra con diferencia." };
  const hoy = new Date().toISOString().slice(0, 10);
  return paso(
    () => db.transaction((tx) => cerrarPartidaEnTx(tx, partidaId, { fecha: hoy, nota })),
    (r) => ({ usuario, entidadId: r.operacionId, detalle: { cierraPartida: partidaId, nota } }),
  );
}

/** Partida aplicada de una vez (hoja o anterior a los pagos por partes): se deshace entera. */
export async function revertirAplicacion(partidaId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const motivo = texto(fd, "motivo", 500);
  if (!motivo) return { error: "Explica qué estaba mal." };
  return paso(
    () =>
      db.transaction(async (tx) => {
        const [p] = await tx.select({ operacionId: partidas.operacionId }).from(partidas).where(eq(partidas.id, partidaId));
        if (!p) return { error: "No existe la partida." } as const;
        const [op] = await tx.select().from(operaciones).where(eq(operaciones.id, p.operacionId)).for("update");
        return revertirPartidaEnTx(tx, op, partidaId);
      }),
    (r) => ({ usuario, entidadId: r.partida.operacionId, detalle: { revierteAplicacion: r.partida, movimientos: r.borrados, motivo } }),
  );
}

// ——— Módulo 3: balance de clientes (Beisy) ———

export async function pagoAlBalance(pagoId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const f = fecha.safeParse(String(fd.get("fecha") ?? ""));
  if (!f.success) return { error: "Pon la fecha." };
  return paso(
    () => db.transaction((tx) => pagoAlBalanceEnTx(tx, pagoId, { fecha: f.data, usuarioId: usuario.id })),
    (r) => ({ usuario, entidadId: r.operacionId, detalle: { pagoAlBalance: pagoId, fecha: f.data } }),
  );
}

export async function revertirBalancePago(pagoId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const motivo = texto(fd, "motivo", 500);
  if (!motivo) return { error: "Explica qué estaba mal." };
  return paso(
    () => db.transaction((tx) => revertirBalancePagoEnTx(tx, pagoId)),
    (r) => ({ usuario, entidadId: r.operacionId, detalle: { quitaDelBalance: pagoId, movimientos: r.borrados, motivo } }),
  );
}

export async function partidaAlBalance(partidaId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const f = fecha.safeParse(String(fd.get("fecha") ?? ""));
  if (!f.success) return { error: "Pon la fecha." };
  return paso(
    () => db.transaction((tx) => partidaAlBalanceEnTx(tx, partidaId, { fecha: f.data, usuarioId: usuario.id })),
    (r) => ({ usuario, entidadId: r.operacionId, detalle: { partidaAlBalance: partidaId, fecha: f.data } }),
  );
}

export async function revertirBalancePartida(partidaId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const motivo = texto(fd, "motivo", 500);
  if (!motivo) return { error: "Explica qué estaba mal." };
  return paso(
    () => db.transaction((tx) => revertirBalancePartidaEnTx(tx, partidaId)),
    (r) => ({ usuario, entidadId: r.operacionId, detalle: { quitaPartidaDelBalance: partidaId, movimientos: r.borrados, motivo } }),
  );
}

// ——— Cambios con doble aprobación ———

export async function proponerCambio(operacionId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  let bruto: unknown;
  try {
    bruto = JSON.parse(String(fd.get("datos") ?? ""));
  } catch {
    return { error: "No se pudieron leer los datos del formulario." };
  }
  const datos = esquemaCambio.safeParse(bruto);
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? "Revisa los datos." };
  const { motivo, ...propuesta } = datos.data;

  const r = await db.transaction(async (tx) => {
    const [op] = await tx.select().from(operaciones).where(eq(operaciones.id, operacionId)).for("update");
    if (!op) return { error: "No existe la operación." };
    if (op.estado === "anulada" || op.estado === "rechazada") return { error: "La operación está anulada o rechazada." };
    if (usuario.rol === "ejecutivo" && op.ejecutivoId !== usuario.ejecutivoId) return { error: "Solo puedes cambiar operaciones de tus clientes." };
    const pendiente = await tx
      .select({ id: cambios.id })
      .from(cambios)
      .where(and(eq(cambios.operacionId, operacionId), eq(cambios.estado, "pendiente")));
    if (pendiente.length) return { error: "Ya hay un cambio pendiente de aprobación en esta operación." };
    const error = await validarCambio(tx, operacionId, propuesta);
    if (error) return { error };
    const ids = propuesta.partidas.map((p) => p.cuentaId).filter((x): x is number => x !== null);
    for (const id of new Set(ids)) {
      const [c] = await tx.select({ moneda: cuentas.moneda }).from(cuentas).where(eq(cuentas.id, id));
      if (!c || propuesta.partidas.some((p) => p.cuentaId === id && p.moneda !== c.moneda)) {
        return { error: "Alguna cuenta sugerida no existe o no es de la moneda de su partida." };
      }
    }
    const [cambio] = await tx
      .insert(cambios)
      .values({ operacionId, motivo, propuesta, anterior: await fotoOperacion(tx, operacionId), creadoPor: usuario.id })
      .returning();
    // Si lo propone un ejecutivo, su firma cuenta como una de las dos.
    const firma = usuario.ejecutivoId
      ? await firmarCambioEnTx(tx, cambio.id, { ejecutivoId: usuario.ejecutivoId, usuarioId: usuario.id, aprueba: true, comentario: "Propuesto por este ejecutivo" })
      : null;
    if (firma && "error" in firma) return firma;
    return { cambioId: cambio.id };
  });
  if ("error" in r) return { error: r.error };
  await registrarAuditoria({ usuarioId: usuario.id, accion: "crear", entidad: "cambio", entidadId: r.cambioId, detalle: { operacionId, motivo, propuesta } });
  refrescar();
  redirect(`/operaciones/${operacionId}`);
}

export async function firmarCambio(cambioId: number, _prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "ejecutivo"]);
  if (!usuario.ejecutivoId) return { error: "Tu usuario no está vinculado a un ejecutivo: no puedes firmar." };
  const aprueba = fd.get("aprueba") === "si";
  const comentario = texto(fd, "comentario", 500);
  if (!aprueba && !comentario) return { error: "Para rechazar, explica el motivo en el comentario." };
  let r: Awaited<ReturnType<typeof firmarCambioEnTx>>;
  try {
    r = await db.transaction((tx) => firmarCambioEnTx(tx, cambioId, { ejecutivoId: usuario.ejecutivoId!, usuarioId: usuario.id, aprueba, comentario }));
  } catch (e) {
    return { error: `No se pudo aplicar el cambio: ${e instanceof Error ? e.message : "error inesperado"}` };
  }
  if ("error" in r) return { error: r.error };
  await registrarAuditoria({ usuarioId: usuario.id, accion: "editar", entidad: "cambio", entidadId: cambioId, detalle: { firma: aprueba ? "aprueba" : "rechaza", comentario, resultado: r.estado } });
  refrescar();
  return { ok: true, mensaje: r.estado === "aplicado" ? "Cambio aprobado y aplicado." : r.estado === "rechazado" ? "Cambio rechazado." : "Firmado. Falta otro ejecutivo." };
}

export async function retirarCambio(cambioId: number): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const [c] = await db.select().from(cambios).where(eq(cambios.id, cambioId));
  if (!c || c.estado !== "pendiente") return { error: "Este cambio ya no está pendiente." };
  if (c.creadoPor !== usuario.id && usuario.rol !== "admin") return { error: "Solo quien lo propuso o un administrador puede retirarlo." };
  await db.update(cambios).set({ estado: "retirado", resueltoEn: new Date() }).where(eq(cambios.id, cambioId));
  await registrarAuditoria({ usuarioId: usuario.id, accion: "editar", entidad: "cambio", entidadId: cambioId, detalle: { retira: true } });
  refrescar();
  return { ok: true };
}

// ——— Módulo 4: transacciones administrativas ———

const TIPOS_ADMINISTRATIVOS = ["gasto", "honorarios", "comision", "traspaso"] as const;

const esquemaAdministrativa = z.object({
  tipo: z.enum(TIPOS_ADMINISTRATIVOS),
  fecha,
  descripcion: z.string().trim().min(2, "Describe la transacción.").max(300),
  moneda: z.enum(["BS", "USD", "USDT", "USDC"]),
  monto: z.number().positive("Pon el monto."),
  destino: z.string().trim().max(300).optional(),
  bancoDestino: z.string().trim().max(100).optional(),
  cuentaOrigen: z.number().int().positive().nullable(),
  cuentaDestino: z.number().int().positive().nullable(),
});

/** Gasto, honorarios, comisión o traspaso entre cuentas propias: solo mueve bancos y pasa por el módulo de pagos. */
export async function crearAdministrativa(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin"]);
  const n = (campo: string) => (fd.get(campo) ? Number(fd.get(campo)) : null);
  const datos = esquemaAdministrativa.safeParse({
    tipo: fd.get("tipo"),
    fecha: fd.get("fecha"),
    descripcion: fd.get("descripcion"),
    moneda: fd.get("moneda"),
    monto: leerImporte(String(fd.get("monto") ?? "")),
    destino: fd.get("destino") || undefined,
    bancoDestino: fd.get("bancoDestino") || undefined,
    cuentaOrigen: n("cuentaOrigen"),
    cuentaDestino: n("cuentaDestino"),
  });
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? "Revisa los datos." };
  const d = datos.data;
  if (d.tipo === "traspaso" && !d.cuentaDestino) return { error: "En un traspaso elige la cuenta de destino." };
  for (const id of [d.cuentaOrigen, d.cuentaDestino]) {
    if (!id) continue;
    const [c] = await db.select({ moneda: cuentas.moneda, entidad: cuentas.entidad }).from(cuentas).where(eq(cuentas.id, id));
    if (!c || c.moneda !== d.moneda) return { error: "Las cuentas tienen que ser de la moneda de la transacción." };
  }
  const [destino] = d.cuentaDestino
    ? await db.select({ nombre: cuentas.nombre, entidad: cuentas.entidad }).from(cuentas).where(eq(cuentas.id, d.cuentaDestino))
    : [];
  let datosPago: unknown = null;
  try {
    datosPago = fd.get("datosPago") ? JSON.parse(String(fd.get("datosPago"))) : null;
  } catch {
    return { error: "No se pudieron leer los datos del beneficiario." };
  }
  // Se validan como cualquier partida: en Bs. hacen falta los datos del beneficiario.
  const partidasValidas = esquemaPartidas.safeParse([
    {
      descripcion: d.descripcion,
      cuentaId: d.cuentaOrigen,
      moneda: d.moneda,
      importeCuenta: -d.monto,
      efectoCliente: 0,
      destino: destino ? destino.nombre : d.destino,
      bancoDestino: destino ? (destino.entidad ?? undefined) : d.bancoDestino,
      datosPago: d.tipo === "traspaso" ? null : datosPago,
    },
    ...(d.tipo === "traspaso"
      ? [{ descripcion: `Entra: ${d.descripcion}`, cuentaId: d.cuentaDestino, moneda: d.moneda, importeCuenta: d.monto, efectoCliente: 0 }]
      : []),
  ]);
  if (!partidasValidas.success) return { error: partidasValidas.error.issues[0]?.message.replace(/^Partida 1 /, "") ?? "Revisa los datos." };
  const lista = partidasValidas.data;
  const id = await db.transaction(async (tx) => {
    const [op] = await tx
      .insert(operaciones)
      .values({ tipo: d.tipo, fecha: d.fecha, descripcion: d.descripcion, montoUsd: d.moneda === "BS" ? null : String(d.monto), creadoPor: usuario.id })
      .returning({ id: operaciones.id });
    await tx.insert(partidas).values(
      lista.map((p, i) => ({ ...p, operacionId: op.id, orden: i + 1, importeCuenta: String(p.importeCuenta), efectoCliente: "0" })),
    );
    if (await requiereAprobacion(tx, lista)) await firmaDelCreador(tx, op.id, usuario);
    else await tx.update(operaciones).set({ estado: "aprobada" }).where(eq(operaciones.id, op.id));
    return op.id;
  });
  await registrarAuditoria({ usuarioId: usuario.id, accion: "crear", entidad: "operacion", entidadId: id, detalle: { administrativa: d } });
  refrescar();
  return { ok: true, mensaje: `Registrada como Op. ${id}. ${d.moneda !== "BS" ? "Saca dólares: pasa a aprobación antes de enviarse." : "Ya aparece en Pagos para reportarla."}` };
}
