import "server-only";
import { and, asc, count, eq, max } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "@/db/schema";
import type { DatosPagoBs } from "./bancos-ve";
import type { PropuestaCambio } from "./esquemas-operacion";
import { partidasConAvance, recalcularEstado } from "./pagos";
import { FIRMAS_REQUERIDAS } from "./operaciones";

type Tx = Pick<NodePgDatabase<typeof s>, "select" | "insert" | "update" | "delete">;

const aTexto = (n: number | null) => (n === null ? null : String(n));

/** Cómo está la operación ahora, con el mismo formato que una propuesta de cambio. */
export async function fotoOperacion(tx: Tx, operacionId: number) {
  const [op] = await tx.select().from(s.operaciones).where(eq(s.operaciones.id, operacionId));
  const lista = await tx.select().from(s.partidas).where(eq(s.partidas.operacionId, operacionId)).orderBy(asc(s.partidas.orden));
  const n = (v: string | null) => (v === null ? null : Number(v));
  return {
    descripcion: op.descripcion ?? undefined,
    montoUsd: n(op.montoUsd),
    tasa: n(op.tasa),
    montoBs: n(op.montoBs),
    utilidad: n(op.utilidad),
    partidas: lista.map((p) => ({
      id: p.id,
      descripcion: p.descripcion,
      cuentaId: p.cuentaId,
      moneda: p.moneda,
      importeCuenta: Number(p.importeCuenta ?? 0),
      efectoCliente: Number(p.efectoCliente ?? 0),
      destino: p.destino,
      bancoDestino: p.bancoDestino,
      datosPago: p.datosPago as DatosPagoBs | null,
    })),
  };
}

/**
 * Revisa que el cambio se pueda aplicar: no se tocan importes ni moneda de
 * partidas ya aplicadas o en el balance, ni se quitan partidas con pagos.
 */
export async function validarCambio(tx: Tx, operacionId: number, propuesta: Omit<PropuestaCambio, "motivo">): Promise<string | null> {
  const actuales = await partidasConAvance(tx, [operacionId]);
  const porId = new Map(actuales.map((p) => [p.id, p]));
  for (const nueva of propuesta.partidas) {
    if (nueva.id === undefined) continue;
    const vieja = porId.get(nueva.id);
    if (!vieja) return "El cambio menciona una partida que ya no existe. Vuelve a proponerlo.";
    const tocada = vieja.numPagos > 0 || vieja.ejecutadaEn || vieja.clienteEn;
    if (!tocada) continue;
    if (vieja.ejecutadaEn || vieja.clienteEn) {
      if (nueva.importeCuenta !== vieja.importe || nueva.efectoCliente !== vieja.efectoCliente || nueva.moneda !== vieja.moneda) {
        return `«${vieja.descripcion}» ya está aplicada: revierte su aplicación antes de cambiar sus importes.`;
      }
    }
    if (vieja.numPagos > 0) {
      if (nueva.moneda !== vieja.moneda) return `«${vieja.descripcion}» ya tiene pagos: no se le puede cambiar la moneda.`;
      if (vieja.enBalance !== 0 && nueva.efectoCliente !== vieja.efectoCliente) {
        return `«${vieja.descripcion}» tiene pagos en el balance del cliente: quítalos del balance antes de cambiar el efecto en el cliente.`;
      }
    }
  }
  const quedan = new Set(propuesta.partidas.map((p) => p.id).filter((x) => x !== undefined));
  for (const vieja of actuales) {
    if (quedan.has(vieja.id)) continue;
    if (vieja.numPagos > 0 || vieja.ejecutadaEn || vieja.clienteEn) {
      return `No se puede quitar «${vieja.descripcion}»: ya tiene pagos o está en el balance. Reviértelos primero.`;
    }
  }
  return null;
}

/** Aplica un cambio aprobado: datos generales y partidas. */
export async function aplicarCambioEnTx(tx: Tx, cambio: typeof s.cambios.$inferSelect): Promise<string | null> {
  const [op] = await tx.select().from(s.operaciones).where(eq(s.operaciones.id, cambio.operacionId)).for("update");
  if (!op) return "No existe la operación.";
  if (op.estado === "anulada" || op.estado === "rechazada") return "La operación está anulada o rechazada.";
  const propuesta = cambio.propuesta as PropuestaCambio;
  const error = await validarCambio(tx, op.id, propuesta);
  if (error) return error;

  await tx
    .update(s.operaciones)
    .set({
      descripcion: propuesta.descripcion || null,
      montoUsd: aTexto(propuesta.montoUsd),
      tasa: aTexto(propuesta.tasa),
      montoBs: aTexto(propuesta.montoBs),
      utilidad: aTexto(propuesta.utilidad),
    })
    .where(eq(s.operaciones.id, op.id));

  const actuales = await tx.select({ id: s.partidas.id }).from(s.partidas).where(eq(s.partidas.operacionId, op.id));
  const quedan = new Set(propuesta.partidas.map((p) => p.id));
  for (const { id } of actuales) {
    if (!quedan.has(id)) await tx.delete(s.partidas).where(eq(s.partidas.id, id));
  }
  const [{ ultimo }] = await tx.select({ ultimo: max(s.partidas.orden) }).from(s.partidas).where(eq(s.partidas.operacionId, op.id));
  let orden = ultimo ?? 0;
  for (const p of propuesta.partidas) {
    const valores = {
      descripcion: p.descripcion,
      cuentaId: p.cuentaId,
      moneda: p.moneda,
      importeCuenta: String(p.importeCuenta),
      efectoCliente: String(p.efectoCliente),
      destino: p.destino,
      bancoDestino: p.bancoDestino,
      datosPago: p.datosPago ?? null,
    };
    if (p.id) await tx.update(s.partidas).set(valores).where(eq(s.partidas.id, p.id));
    else await tx.insert(s.partidas).values({ ...valores, operacionId: op.id, orden: ++orden });
  }
  // Dos ejecutivos aprobaron el cambio: eso vale también como aprobación de la operación.
  if (op.estado === "pendiente_firmas") {
    await tx.update(s.operaciones).set({ estado: "aprobada" }).where(eq(s.operaciones.id, op.id));
    op.estado = "aprobada";
  }
  await recalcularEstado(tx, op);
  return null;
}

/**
 * Firma de un ejecutivo sobre un cambio. Con dos aprobaciones se aplica; con
 * un rechazo se descarta. Devuelve un error o en qué quedó el cambio.
 */
export async function firmarCambioEnTx(
  tx: Tx,
  cambioId: number,
  firma: { ejecutivoId: number; usuarioId: number; aprueba: boolean; comentario: string | null },
): Promise<{ error: string } | { estado: s.EstadoCambio; operacionId: number }> {
  const [cambio] = await tx.select().from(s.cambios).where(eq(s.cambios.id, cambioId)).for("update");
  if (!cambio) return { error: "No existe el cambio." };
  if (cambio.estado !== "pendiente") return { error: "Este cambio ya no está pendiente." };
  const ya = await tx
    .select({ id: s.firmasCambio.id })
    .from(s.firmasCambio)
    .where(and(eq(s.firmasCambio.cambioId, cambioId), eq(s.firmasCambio.ejecutivoId, firma.ejecutivoId)));
  if (ya.length) return { error: "Ya firmaste este cambio." };
  await tx.insert(s.firmasCambio).values({ cambioId, ...firma });
  if (!firma.aprueba) {
    await tx
      .update(s.cambios)
      .set({ estado: "rechazado", resueltoEn: new Date(), comentario: firma.comentario })
      .where(eq(s.cambios.id, cambioId));
    return { estado: "rechazado", operacionId: cambio.operacionId };
  }
  const [{ n }] = await tx
    .select({ n: count() })
    .from(s.firmasCambio)
    .where(and(eq(s.firmasCambio.cambioId, cambioId), eq(s.firmasCambio.aprueba, true)));
  if (n < FIRMAS_REQUERIDAS) return { estado: "pendiente", operacionId: cambio.operacionId };
  const error = await aplicarCambioEnTx(tx, cambio);
  if (error) throw new Error(error);
  await tx.update(s.cambios).set({ estado: "aplicado", resueltoEn: new Date() }).where(eq(s.cambios.id, cambioId));
  return { estado: "aplicado", operacionId: cambio.operacionId };
}
