import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "@/db/schema";

type Tx = Pick<NodePgDatabase<typeof s>, "select" | "insert" | "update">;

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
