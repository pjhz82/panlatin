import "server-only";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "@/db/schema";
import { esSalidaDeDolares } from "./operaciones";

type Tx = Pick<NodePgDatabase<typeof s>, "select" | "insert" | "update" | "delete">;

/**
 * Ejecuta una partida dentro de una transacción: genera el movimiento de la
 * cuenta de tesorería y el del estado de cuenta del cliente, y actualiza el
 * estado de la operación. Devuelve un mensaje de error o null.
 * Quien llama debe haber bloqueado la operación (select … for update).
 */
export async function ejecutarPartidaEnTx(
  tx: Tx,
  op: typeof s.operaciones.$inferSelect,
  partidaId: number,
  datos: { fecha: string; referencia?: string | null; usuarioId: number },
): Promise<string | null> {
  if (op.estado !== "aprobada" && op.estado !== "en_ejecucion") {
    return "Solo se ejecutan partidas de operaciones aprobadas (con las firmas completas).";
  }
  const [p] = await tx.select().from(s.partidas).where(and(eq(s.partidas.id, partidaId), eq(s.partidas.operacionId, op.id)));
  if (!p) return "No existe la partida.";
  if (p.ejecutadaEn) return "Esta partida ya se ejecutó.";
  if (!p.cuentaId && Number(p.importeCuenta) !== 0) return "Asigna la cuenta de la partida antes de aplicarla.";

  const [cuenta] = p.cuentaId ? await tx.select({ nombre: s.cuentas.nombre }).from(s.cuentas).where(eq(s.cuentas.id, p.cuentaId)) : [];
  const base = {
    fecha: datos.fecha,
    concepto: p.descripcion,
    detalle: [op.descripcion, `Op. ${op.id}`].filter(Boolean).join(" · "),
    referencia: datos.referencia ?? p.referencia ?? null,
    origen: "operacion",
    partidaId: p.id,
    creadoPor: datos.usuarioId,
  };
  if (p.cuentaId && Number(p.importeCuenta) !== 0) {
    await tx.insert(s.movimientos).values({ ...base, cuentaId: p.cuentaId, importe: p.importeCuenta! });
  }
  if (op.subcuentaId && Number(p.efectoCliente) !== 0) {
    await tx.insert(s.movimientos).values({ ...base, subcuentaId: op.subcuentaId, formaPago: cuenta?.nombre ?? null, importe: p.efectoCliente! });
  }
  await tx
    .update(s.partidas)
    .set({ ejecutadaEn: datos.fecha, referencia: datos.referencia ?? p.referencia ?? null, ejecutadaPor: datos.usuarioId })
    .where(eq(s.partidas.id, p.id));
  const [{ n }] = await tx
    .select({ n: count() })
    .from(s.partidas)
    .where(and(eq(s.partidas.operacionId, op.id), isNull(s.partidas.ejecutadaEn)));
  const estado = n === 0 ? "completada" : "en_ejecucion";
  await tx.update(s.operaciones).set({ estado }).where(eq(s.operaciones.id, op.id));
  op.estado = estado;
  return null;
}

/**
 * Si quien monta la operación es un ejecutivo, su firma cuenta como
 * aprobación: solo falta la de otro ejecutivo.
 */
export async function firmaDelCreador(
  tx: Tx,
  operacionId: number,
  usuario: { id: number; ejecutivoId: number | null },
) {
  if (!usuario.ejecutivoId) return;
  await tx.insert(s.firmas).values({
    operacionId,
    ejecutivoId: usuario.ejecutivoId,
    usuarioId: usuario.id,
    aprueba: true,
    comentario: "Montada por este ejecutivo",
  });
}

/** ¿Alguna partida saca dólares de una cuenta? Solo esas operaciones necesitan aprobación. */
export async function requiereAprobacion(
  tx: Tx,
  lista: { cuentaId: number | null; importeCuenta: number | string | null }[],
): Promise<boolean> {
  const ids = [...new Set(lista.map((p) => p.cuentaId).filter((x): x is number => x !== null))];
  if (!ids.length) return false;
  const monedas = new Map(
    (await tx.select({ id: s.cuentas.id, moneda: s.cuentas.moneda }).from(s.cuentas).where(inArray(s.cuentas.id, ids))).map((c) => [c.id, c.moneda]),
  );
  return lista.some((p) => p.cuentaId !== null && esSalidaDeDolares(Number(p.importeCuenta), monedas.get(p.cuentaId) ?? null));
}

/** Estado que corresponde a una operación aprobada según cuántas partidas lleva aplicadas. */
async function estadoAprobado(tx: Tx, operacionId: number) {
  const [{ total, aplicadas }] = await tx
    .select({ total: count(), aplicadas: count(s.partidas.ejecutadaEn) })
    .from(s.partidas)
    .where(eq(s.partidas.operacionId, operacionId));
  if (aplicadas === 0) return "aprobada" as const;
  return aplicadas === total ? ("completada" as const) : ("en_ejecucion" as const);
}

/**
 * Tras corregir partidas: si ahora hay una transferencia de dólares sin
 * aplicar (o se cambió una), vuelve a pedir aprobación; si ya no la hay,
 * queda aprobada. `tocaDolares` indica si el cambio afectó a una salida de dólares.
 */
export async function revisarAprobacion(tx: Tx, op: typeof s.operaciones.$inferSelect, tocaDolares: boolean) {
  const pendientes = await tx
    .select({ cuentaId: s.partidas.cuentaId, importeCuenta: s.partidas.importeCuenta })
    .from(s.partidas)
    .where(and(eq(s.partidas.operacionId, op.id), isNull(s.partidas.ejecutadaEn)));
  const necesita = await requiereAprobacion(tx, pendientes);
  let estado: typeof op.estado;
  if (necesita && (tocaDolares || op.estado !== "pendiente_firmas")) {
    // Lo aprobado cambió: se borran las firmas y firma de nuevo quien la cerró, si es ejecutivo.
    await tx.delete(s.firmas).where(eq(s.firmas.operacionId, op.id));
    const [autor] = await tx
      .select({ id: s.usuarios.id, ejecutivoId: s.usuarios.ejecutivoId })
      .from(s.usuarios)
      .where(eq(s.usuarios.id, op.creadoPor));
    if (autor) await firmaDelCreador(tx, op.id, autor);
    estado = "pendiente_firmas";
  } else if (necesita) {
    estado = "pendiente_firmas";
  } else {
    estado = await estadoAprobado(tx, op.id);
  }
  await tx.update(s.operaciones).set({ estado }).where(eq(s.operaciones.id, op.id));
  op.estado = estado;
}

/**
 * Corrige una partida ya aplicada: borra sus movimientos (cuenta y cliente)
 * y la deja pendiente de aplicar otra vez. Devuelve los movimientos borrados o un error.
 */
export async function revertirPartidaEnTx(tx: Tx, op: typeof s.operaciones.$inferSelect, partidaId: number) {
  const [p] = await tx.select().from(s.partidas).where(and(eq(s.partidas.id, partidaId), eq(s.partidas.operacionId, op.id)));
  if (!p) return { error: "No existe la partida." };
  if (!p.ejecutadaEn) return { error: "Esta partida no está aplicada." };
  const borrados = await tx.delete(s.movimientos).where(eq(s.movimientos.partidaId, p.id)).returning();
  await tx.update(s.partidas).set({ ejecutadaEn: null, ejecutadaPor: null }).where(eq(s.partidas.id, p.id));
  if (op.estado !== "pendiente_firmas") {
    const estado = await estadoAprobado(tx, op.id);
    await tx.update(s.operaciones).set({ estado }).where(eq(s.operaciones.id, op.id));
    op.estado = estado;
  }
  return { partida: p, borrados };
}
