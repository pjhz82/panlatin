"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientes, cuentas, estadoOperacion, firmas, operaciones, partidas, subcuentas, tipoOperacion } from "@/db/schema";
import { ejecutivoDe } from "@/lib/alcance";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import type { EstadoFormulario } from "@/lib/formularios";
import { ejecutarPartidaEnTx, firmaDelCreador, requiereAprobacion } from "@/lib/ejecucion";
import { CON_CLIENTE, FIRMAS_REQUERIDAS } from "@/lib/operaciones";
import { partidasConAvance, recalcularEstado, resumenAvance } from "@/lib/pagos";
import { filtroSubcuentas } from "@/lib/alcance";
import { esquemaGenerales, esquemaPartidas, type PartidaEntrada } from "@/lib/esquemas-operacion";

const esquemaOperacion = esquemaGenerales.extend({
  tipo: z.enum(tipoOperacion.enumValues),
  fecha: z.iso.date("Pon la fecha."),
  subcuenta: z.string().trim().optional(),
  partidas: esquemaPartidas,
});

export async function crearOperacion(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  let bruto: unknown;
  try {
    bruto = JSON.parse(String(formData.get("datos") ?? ""));
  } catch {
    return { error: "No se pudieron leer los datos del formulario." };
  }
  const datos = esquemaOperacion.safeParse(bruto);
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? "Revisa los datos." };
  const o = datos.data;

  let subcuentaId: number | null = null;
  if (o.subcuenta) {
    const [s] = await db
      .select({ id: subcuentas.id })
      .from(subcuentas)
      .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
      .where(and(eq(subcuentas.nombre, o.subcuenta), filtroSubcuentas(usuario)))
      .limit(1);
    if (!s) return { error: `No existe la subcuenta «${o.subcuenta}». Elígela de la lista.` };
    subcuentaId = s.id;
  }
  if (CON_CLIENTE.includes(o.tipo) && !subcuentaId) return { error: "Elige el cliente (subcuenta)." };
  if (!subcuentaId && o.partidas.some((p) => p.efectoCliente !== 0)) {
    return { error: "Hay partidas con efecto en el cliente pero no has elegido cliente." };
  }
  const error = await revisarCuentasSugeridas(o.partidas);
  if (error) return { error };

  const id = await db.transaction(async (tx) => {
    const [op] = await tx
      .insert(operaciones)
      .values({
        tipo: o.tipo,
        fecha: o.fecha,
        subcuentaId,
        descripcion: o.descripcion || null,
        montoUsd: o.montoUsd === null ? null : String(o.montoUsd),
        tasa: o.tasa === null ? null : String(o.tasa),
        montoBs: o.montoBs === null ? null : String(o.montoBs),
        utilidad: o.utilidad === null ? null : String(o.utilidad),
        creadoPor: usuario.id,
        ejecutivoId: await ejecutivoDe(subcuentaId),
      })
      .returning({ id: operaciones.id });
    await tx.insert(partidas).values(
      o.partidas.map((p, i) => ({
        operacionId: op.id,
        orden: i + 1,
        descripcion: p.descripcion,
        cuentaId: p.cuentaId,
        moneda: p.moneda,
        importeCuenta: String(p.importeCuenta),
        efectoCliente: String(p.efectoCliente),
        destino: p.destino,
        bancoDestino: p.bancoDestino,
        datosPago: p.datosPago,
      })),
    );
    // Solo las transferencias de dólares necesitan aprobación; el resto queda aprobado al crearse.
    if (await requiereAprobacion(tx, o.partidas)) {
      await firmaDelCreador(tx, op.id, usuario);
    } else {
      await tx.update(operaciones).set({ estado: "aprobada" }).where(eq(operaciones.id, op.id));
    }
    return op.id;
  });
  await registrarAuditoria({ usuarioId: usuario.id, accion: "crear", entidad: "operacion", entidadId: id, detalle: o });
  revalidatePath("/operaciones");
  redirect(`/operaciones/${id}`);
}

/** Las cuentas sugeridas deben existir, estar activas y ser de la moneda de la partida. */
async function revisarCuentasSugeridas(lista: PartidaEntrada[]): Promise<string | null> {
  const ids = [...new Set(lista.map((p) => p.cuentaId).filter((x): x is number => x !== null))];
  if (!ids.length) return null;
  const filas = await db.select({ id: cuentas.id, moneda: cuentas.moneda }).from(cuentas).where(and(inArray(cuentas.id, ids), eq(cuentas.activa, true)));
  if (filas.length !== ids.length) return "Alguna cuenta elegida no existe o está inactiva.";
  const moneda = new Map(filas.map((c) => [c.id, c.moneda]));
  const mal = lista.find((p) => p.cuentaId !== null && moneda.get(p.cuentaId) !== p.moneda);
  return mal ? `«${mal.descripcion}»: la cuenta sugerida no es de la moneda de la partida.` : null;
}

export async function firmarOperacion(operacionId: number, _prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "ejecutivo"]);
  if (!usuario.ejecutivoId) return { error: "Tu usuario no está vinculado a un ejecutivo: no puedes firmar." };
  const aprueba = formData.get("aprueba") === "si";
  const comentario = String(formData.get("comentario") ?? "").trim().slice(0, 500) || null;
  if (!aprueba && !comentario) return { error: "Para rechazar, explica el motivo en el comentario." };

  const firmar = () => db.transaction(async (tx) => {
    const [op] = await tx.select().from(operaciones).where(eq(operaciones.id, operacionId)).for("update");
    if (!op) return "No existe la operación.";
    if (op.estado !== "pendiente_firmas") return "Esta operación ya no está pendiente de firmas.";
    const ya = await tx
      .select({ id: firmas.id })
      .from(firmas)
      .where(and(eq(firmas.operacionId, operacionId), eq(firmas.ejecutivoId, usuario.ejecutivoId!)));
    if (ya.length) return "Tu ejecutivo ya firmó esta operación.";
    await tx.insert(firmas).values({ operacionId, ejecutivoId: usuario.ejecutivoId!, usuarioId: usuario.id, aprueba, comentario });
    if (!aprueba) {
      await tx.update(operaciones).set({ estado: "rechazada", motivoCierre: comentario }).where(eq(operaciones.id, operacionId));
    } else {
      const [{ n }] = await tx.select({ n: count() }).from(firmas).where(and(eq(firmas.operacionId, operacionId), eq(firmas.aprueba, true)));
      if (n >= FIRMAS_REQUERIDAS) {
        await tx.update(operaciones).set({ estado: "aprobada" }).where(eq(operaciones.id, operacionId));
        op.estado = "aprobada";
        // Registrada desde la hoja del cliente: se ejecuta sola con su fecha.
        if (op.ejecutarAlAprobar) {
          const pendientes = await tx
            .select({ id: partidas.id })
            .from(partidas)
            .where(and(eq(partidas.operacionId, operacionId), isNull(partidas.ejecutadaEn)))
            .orderBy(partidas.orden);
          for (const p of pendientes) {
            const error = await ejecutarPartidaEnTx(tx, op, p.id, { fecha: op.fecha, usuarioId: usuario.id });
            if (error) throw new Error(error);
          }
        } else {
          // Puede tener cobros ya reportados mientras esperaba la aprobación.
          await recalcularEstado(tx, op);
        }
      }
    }
    return null;
  });
  let resultado: string | null;
  try {
    resultado = await firmar();
  } catch (e) {
    resultado = `No se pudo firmar: ${e instanceof Error ? e.message : "error inesperado"}`;
  }
  if (resultado) return { error: resultado };
  await registrarAuditoria({ usuarioId: usuario.id, accion: "editar", entidad: "operacion", entidadId: operacionId, detalle: { firma: aprueba ? "aprueba" : "rechaza", comentario } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function anularOperacion(operacionId: number, _prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 500);
  if (!motivo) return { error: "Explica por qué se anula." };
  const resultado = await db.transaction(async (tx) => {
    const [op] = await tx.select().from(operaciones).where(eq(operaciones.id, operacionId)).for("update");
    if (!op) return "No existe la operación.";
    if (!(["pendiente_firmas", "aprobada", "en_ejecucion"] as (typeof estadoOperacion.enumValues)[number][]).includes(op.estado)) {
      return "Esta operación ya está cerrada.";
    }
    if (resumenAvance(await partidasConAvance(tx, [op.id])).algoHecho) {
      return "Tiene pagos reportados o asientos en el balance: reviértelos antes de anular.";
    }
    await tx.update(operaciones).set({ estado: "anulada", motivoCierre: motivo }).where(eq(operaciones.id, operacionId));
    return null;
  });
  if (resultado) return { error: resultado };
  await registrarAuditoria({ usuarioId: usuario.id, accion: "editar", entidad: "operacion", entidadId: operacionId, detalle: { anula: motivo } });
  revalidatePath("/", "layout");
  return { ok: true };
}
