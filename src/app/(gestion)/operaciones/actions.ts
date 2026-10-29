"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cuentas, estadoOperacion, firmas, operaciones, partidas, subcuentas, tipoOperacion } from "@/db/schema";
import { ejecutivoDe } from "@/lib/alcance";
import { requerirUsuario } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import type { EstadoFormulario } from "@/lib/formularios";
import { ejecutarPartidaEnTx, firmaDelCreador } from "@/lib/ejecucion";
import { CON_CLIENTE, FIRMAS_REQUERIDAS } from "@/lib/operaciones";

const numero = z.number().finite();

const esquemaOperacion = z
  .object({
    tipo: z.enum(tipoOperacion.enumValues),
    fecha: z.iso.date("Pon la fecha."),
    subcuenta: z.string().trim().optional(),
    descripcion: z.string().trim().max(500).optional(),
    montoUsd: numero.nonnegative().nullable(),
    tasa: numero.nonnegative().nullable(),
    montoBs: numero.nullable(),
    utilidad: numero.nullable(),
    partidas: z
      .array(
        z.object({
          descripcion: z.string().trim().min(1, "Cada partida necesita una descripción."),
          cuentaId: z.number().int().positive().nullable(),
          importeCuenta: numero,
          efectoCliente: numero,
        }),
      )
      .min(1, "Añade al menos una partida."),
  })
  .superRefine((o, ctx) => {
    o.partidas.forEach((p, i) => {
      if (p.importeCuenta !== 0 && !p.cuentaId) {
        ctx.addIssue({ code: "custom", path: ["partidas"], message: `Partida ${i + 1}: elige la cuenta.` });
      }
      if (p.importeCuenta === 0 && p.efectoCliente === 0) {
        ctx.addIssue({ code: "custom", path: ["partidas"], message: `Partida ${i + 1}: no mueve nada (importes a cero).` });
      }
    });
  });

export async function crearOperacion(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
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
    const [s] = await db.select({ id: subcuentas.id }).from(subcuentas).where(eq(subcuentas.nombre, o.subcuenta)).limit(1);
    if (!s) return { error: `No existe la subcuenta «${o.subcuenta}». Elígela de la lista.` };
    subcuentaId = s.id;
  }
  if (CON_CLIENTE.includes(o.tipo) && !subcuentaId) return { error: "Elige el cliente (subcuenta)." };
  if (!subcuentaId && o.partidas.some((p) => p.efectoCliente !== 0)) {
    return { error: "Hay partidas con efecto en el cliente pero no has elegido cliente." };
  }
  const idsCuenta = [...new Set(o.partidas.map((p) => p.cuentaId).filter((x): x is number => x !== null))];
  if (idsCuenta.length) {
    const [{ n }] = await db.select({ n: count() }).from(cuentas).where(and(inArray(cuentas.id, idsCuenta), eq(cuentas.activa, true)));
    if (n !== idsCuenta.length) return { error: "Alguna cuenta elegida no existe o está inactiva." };
  }

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
        importeCuenta: String(p.importeCuenta),
        efectoCliente: String(p.efectoCliente),
      })),
    );
    await firmaDelCreador(tx, op.id, usuario);
    return op.id;
  });
  await registrarAuditoria({ usuarioId: usuario.id, accion: "crear", entidad: "operacion", entidadId: id, detalle: o });
  revalidatePath("/operaciones");
  redirect(`/operaciones/${id}`);
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
  revalidatePath(`/operaciones/${operacionId}`);
  revalidatePath("/operaciones");
  return { ok: true };
}

const esquemaEjecucion = z.object({
  fecha: z.iso.date("Pon la fecha del pago o cobro."),
  referencia: z.string().trim().max(200).optional(),
});

export async function ejecutarPartida(partidaId: number, _prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const datos = esquemaEjecucion.safeParse({
    fecha: String(formData.get("fecha") ?? ""),
    referencia: String(formData.get("referencia") ?? "") || undefined,
  });
  if (!datos.success) return { error: datos.error.issues[0].message };

  const resultado = await db.transaction(async (tx) => {
    const [p] = await tx.select({ operacionId: partidas.operacionId }).from(partidas).where(eq(partidas.id, partidaId));
    if (!p) return { error: "No existe la partida." };
    const [op] = await tx.select().from(operaciones).where(eq(operaciones.id, p.operacionId)).for("update");
    const error = await ejecutarPartidaEnTx(tx, op, partidaId, { ...datos.data, usuarioId: usuario.id });
    return error ? { error } : { operacionId: op.id };
  });
  if ("error" in resultado) return { error: resultado.error };
  await registrarAuditoria({ usuarioId: usuario.id, accion: "editar", entidad: "operacion", entidadId: resultado.operacionId, detalle: { ejecutaPartida: partidaId, ...datos.data } });
  revalidatePath(`/operaciones/${resultado.operacionId}`);
  revalidatePath("/operaciones");
  return { ok: true };
}

export async function anularOperacion(operacionId: number, _prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requerirUsuario(["admin", "operadora"]);
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 500);
  if (!motivo) return { error: "Explica por qué se anula." };
  const resultado = await db.transaction(async (tx) => {
    const [op] = await tx.select().from(operaciones).where(eq(operaciones.id, operacionId)).for("update");
    if (!op) return "No existe la operación.";
    if (!(["pendiente_firmas", "aprobada"] as (typeof estadoOperacion.enumValues)[number][]).includes(op.estado)) {
      return "Solo se anulan operaciones sin partidas ejecutadas.";
    }
    await tx.update(operaciones).set({ estado: "anulada", motivoCierre: motivo }).where(eq(operaciones.id, operacionId));
    return null;
  });
  if (resultado) return { error: resultado };
  await registrarAuditoria({ usuarioId: usuario.id, accion: "editar", entidad: "operacion", entidadId: operacionId, detalle: { anula: motivo } });
  revalidatePath(`/operaciones/${operacionId}`);
  revalidatePath("/operaciones");
  return { ok: true };
}
