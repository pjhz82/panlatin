import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@/db";
import * as s from "@/db/schema";
import { avancePartida, esSalidaDeDolares, TOLERANCIA } from "./operaciones";

type Tx = Pick<NodePgDatabase<typeof s>, "select" | "insert" | "update" | "delete">;
type Operacion = typeof s.operaciones.$inferSelect;

const r2 = (n: number) => Math.round(n * 100) / 100;
const CERRADAS: s.EstadoOperacion[] = ["anulada", "rechazada"];

/** Partidas de unas operaciones con lo pagado y lo llevado al balance. */
export async function partidasConAvance(cx: Pick<Tx, "select">, operacionIds: number[]) {
  if (!operacionIds.length) return [];
  const pagado = sql<string>`coalesce((select sum(${s.pagos.importe}) from ${s.pagos} where ${s.pagos.partidaId} = ${s.partidas.id}), 0)`;
  const enBalance = sql<string>`coalesce((select sum(${s.pagos.efectoCliente}) from ${s.pagos} where ${s.pagos.partidaId} = ${s.partidas.id} and ${s.pagos.balanceEn} is not null), 0)`;
  const sinBalance = sql<number>`(select count(*) from ${s.pagos} where ${s.pagos.partidaId} = ${s.partidas.id} and ${s.pagos.balanceEn} is null and ${s.pagos.efectoCliente} <> 0)`;
  const numPagos = sql<number>`(select count(*) from ${s.pagos} where ${s.pagos.partidaId} = ${s.partidas.id})`;
  const filas = await cx
    .select({
      p: s.partidas,
      conCliente: sql<boolean>`${s.operaciones.subcuentaId} is not null`,
      pagado,
      enBalance,
      sinBalance: sinBalance.mapWith(Number),
      numPagos: numPagos.mapWith(Number),
    })
    .from(s.partidas)
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .where(inArray(s.partidas.operacionId, operacionIds))
    .orderBy(asc(s.partidas.operacionId), asc(s.partidas.orden));
  return filas.map((f) => {
    const datos = {
      moneda: f.p.moneda,
      importe: Number(f.p.importeCuenta ?? 0),
      efectoCliente: Number(f.p.efectoCliente ?? 0),
      pagado: Number(f.pagado),
      enBalance: Number(f.enBalance),
      pagosSinBalance: f.sinBalance,
      ejecutadaEn: f.p.ejecutadaEn,
      clienteEn: f.p.clienteEn,
      cerradaEn: f.p.cerradaEn,
    };
    return { ...f.p, ...datos, numPagos: f.numPagos, avance: avancePartida(datos, f.conCliente) };
  });
}
export type PartidaConAvance = Awaited<ReturnType<typeof partidasConAvance>>[number];

/** Resumen de una operación a partir de sus partidas. */
export function resumenAvance(lista: PartidaConAvance[]) {
  const banco = lista.filter((p) => p.avance.ladoBanco);
  const cliente = lista.filter((p) => p.avance.ladoCliente);
  const pct = (xs: PartidaConAvance[], f: (p: PartidaConAvance) => number) =>
    xs.length ? xs.reduce((t, p) => t + f(p), 0) / xs.length : 1;
  return {
    pctPagado: pct(banco, (p) => p.avance.pct),
    pctBalance: pct(cliente, (p) =>
      Math.abs(p.efectoCliente) > TOLERANCIA ? Math.min(1, Math.abs(p.avance.enBalance) / Math.abs(p.efectoCliente)) : 1,
    ),
    porPagar: banco.filter((p) => !p.avance.pagada).length,
    porBalance: cliente.filter((p) => p.avance.pendienteBalance).length,
    terminada: lista.length > 0 && lista.every((p) => p.avance.terminada),
    algoHecho: lista.some((p) => p.numPagos > 0 || p.ejecutadaEn || p.clienteEn),
  };
}

/** Pone el estado de la operación según su avance (salvo si espera firmas o está cerrada). */
export async function recalcularEstado(tx: Tx, op: Operacion) {
  if (op.estado === "pendiente_firmas" || CERRADAS.includes(op.estado)) return;
  const r = resumenAvance(await partidasConAvance(tx, [op.id]));
  const estado: s.EstadoOperacion = r.terminada ? "completada" : r.algoHecho ? "en_ejecucion" : "aprobada";
  if (estado !== op.estado) {
    await tx.update(s.operaciones).set({ estado }).where(eq(s.operaciones.id, op.id));
    op.estado = estado;
  }
}

const detalleMovimiento = (op: Operacion) => [op.descripcion, `Op. ${op.id}`].filter(Boolean).join(" · ");

/**
 * Reporta un pago enviado o recibido (puede ser una parte de la partida).
 * Mueve la cuenta en el acto; el cliente se mueve cuando se lleva al balance.
 */
export async function reportarPagoEnTx(
  tx: Tx,
  partidaId: number,
  datos: {
    cuentaId: number;
    fecha: string;
    monto: number;
    /** Lo que cobró el banco por el pago (positivo); sale de la misma cuenta. */
    comisionBanco: number;
    referencia: string | null;
    interbancario: boolean;
    nota: string | null;
    usuarioId: number;
  },
): Promise<{ error: string } | { pagoId: number; operacionId: number }> {
  const [fila] = await tx
    .select({ p: s.partidas, op: s.operaciones })
    .from(s.partidas)
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .where(eq(s.partidas.id, partidaId))
    .for("update");
  if (!fila) return { error: "No existe la partida." };
  const { p, op } = fila;
  if (CERRADAS.includes(op.estado)) return { error: "La operación está anulada o rechazada." };
  if (p.ejecutadaEn || p.cerradaEn) return { error: "Esta partida ya está cerrada." };
  if (!p.moneda || !Number(p.importeCuenta)) return { error: "Esta partida no mueve banco: va directo al balance del cliente." };
  const instruido = Number(p.importeCuenta);
  if (op.estado === "pendiente_firmas" && esSalidaDeDolares(instruido, p.moneda)) {
    return { error: "Es una transferencia de dólares: no se puede enviar hasta que la aprueben dos ejecutivos." };
  }
  const [cuenta] = await tx.select().from(s.cuentas).where(eq(s.cuentas.id, datos.cuentaId));
  if (!cuenta || !cuenta.activa) return { error: "La cuenta no existe o está inactiva." };
  if (cuenta.moneda !== p.moneda) return { error: `La instrucción es en ${p.moneda} y la cuenta elegida es en ${cuenta.moneda}.` };
  if (!(datos.monto > 0)) return { error: "Pon el monto del pago." };

  const [{ previo, efectoPrevio }] = await tx
    .select({
      previo: sql<string>`coalesce(sum(${s.pagos.importe}), 0)`,
      efectoPrevio: sql<string>`coalesce(sum(${s.pagos.efectoCliente}), 0)`,
    })
    .from(s.pagos)
    .where(eq(s.pagos.partidaId, p.id));
  const importe = Math.sign(instruido) * datos.monto;
  const efectoTotal = op.subcuentaId ? Number(p.efectoCliente ?? 0) : 0;
  const acumulado = Number(previo) + importe;
  // El pago que completa la partida se lleva el resto exacto del efecto para no arrastrar céntimos.
  const efecto =
    Math.abs(acumulado) >= Math.abs(instruido) - TOLERANCIA
      ? r2(efectoTotal - Number(efectoPrevio))
      : r2((efectoTotal * importe) / instruido);

  const [pago] = await tx
    .insert(s.pagos)
    .values({
      partidaId: p.id,
      cuentaId: cuenta.id,
      fecha: datos.fecha,
      importe: String(importe),
      efectoCliente: String(efecto),
      referencia: datos.referencia,
      interbancario: importe < 0 && datos.interbancario,
      comisionBanco: String(datos.comisionBanco),
      nota: datos.nota,
      reportadoPor: datos.usuarioId,
    })
    .returning({ id: s.pagos.id });
  await tx.insert(s.movimientos).values({
    fecha: datos.fecha,
    cuentaId: cuenta.id,
    concepto: p.descripcion,
    detalle: [detalleMovimiento(op), p.destino].filter(Boolean).join(" · "),
    referencia: datos.referencia,
    nota: datos.nota,
    importe: String(importe),
    origen: "operacion",
    partidaId: p.id,
    pagoId: pago.id,
    creadoPor: datos.usuarioId,
  });
  if (datos.comisionBanco > 0) {
    await tx.insert(s.movimientos).values({
      fecha: datos.fecha,
      cuentaId: cuenta.id,
      concepto: "Comisión bancaria",
      detalle: [p.descripcion, detalleMovimiento(op)].join(" · "),
      referencia: datos.referencia,
      importe: String(-datos.comisionBanco),
      origen: "operacion",
      partidaId: p.id,
      pagoId: pago.id,
      creadoPor: datos.usuarioId,
    });
  }
  await recalcularEstado(tx, op);
  return { pagoId: pago.id, operacionId: op.id };
}

/** Corrige un pago mal reportado: borra el pago y sus movimientos (banco y, si ya estaba, cliente). */
export async function revertirPagoEnTx(tx: Tx, pagoId: number) {
  const [fila] = await tx
    .select({ pago: s.pagos, op: s.operaciones })
    .from(s.pagos)
    .innerJoin(s.partidas, eq(s.partidas.id, s.pagos.partidaId))
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .where(eq(s.pagos.id, pagoId))
    .for("update");
  if (!fila) return { error: "No existe el pago." } as const;
  const borrados = await tx.delete(s.movimientos).where(eq(s.movimientos.pagoId, pagoId)).returning();
  await tx.delete(s.pagos).where(eq(s.pagos.id, pagoId));
  await tx.update(s.partidas).set({ cerradaEn: null, cerradaNota: null }).where(eq(s.partidas.id, fila.pago.partidaId));
  await recalcularEstado(tx, fila.op);
  return { pago: fila.pago, operacionId: fila.op.id, borrados } as const;
}

/** Lleva un pago al balance del cliente (lo revisa quien cuadra los clientes). */
export async function pagoAlBalanceEnTx(tx: Tx, pagoId: number, datos: { fecha: string; usuarioId: number }) {
  const [fila] = await tx
    .select({ pago: s.pagos, p: s.partidas, op: s.operaciones, cuenta: s.cuentas.nombre })
    .from(s.pagos)
    .innerJoin(s.partidas, eq(s.partidas.id, s.pagos.partidaId))
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .innerJoin(s.cuentas, eq(s.cuentas.id, s.pagos.cuentaId))
    .where(eq(s.pagos.id, pagoId))
    .for("update");
  if (!fila) return { error: "No existe el pago." } as const;
  const { pago, p, op } = fila;
  if (pago.balanceEn) return { error: "Este pago ya está en el balance del cliente." } as const;
  if (!op.subcuentaId || !Number(pago.efectoCliente)) return { error: "Este pago no afecta a ningún cliente." } as const;
  await tx.insert(s.movimientos).values({
    fecha: datos.fecha,
    subcuentaId: op.subcuentaId,
    concepto: p.descripcion,
    detalle: detalleMovimiento(op),
    formaPago: fila.cuenta,
    referencia: pago.referencia,
    importe: pago.efectoCliente,
    origen: "operacion",
    partidaId: p.id,
    pagoId: pago.id,
    creadoPor: datos.usuarioId,
  });
  await tx.update(s.pagos).set({ balanceEn: datos.fecha, balancePor: datos.usuarioId }).where(eq(s.pagos.id, pago.id));
  await recalcularEstado(tx, op);
  return { operacionId: op.id } as const;
}

/** Quita del balance del cliente un pago (el pago sigue reportado). */
export async function revertirBalancePagoEnTx(tx: Tx, pagoId: number) {
  const [fila] = await tx
    .select({ pago: s.pagos, op: s.operaciones })
    .from(s.pagos)
    .innerJoin(s.partidas, eq(s.partidas.id, s.pagos.partidaId))
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .where(eq(s.pagos.id, pagoId))
    .for("update");
  if (!fila) return { error: "No existe el pago." } as const;
  if (!fila.pago.balanceEn) return { error: "Este pago no está en el balance." } as const;
  const borrados = await tx
    .delete(s.movimientos)
    .where(and(eq(s.movimientos.pagoId, pagoId), isNotNull(s.movimientos.subcuentaId)))
    .returning();
  await tx.update(s.pagos).set({ balanceEn: null, balancePor: null }).where(eq(s.pagos.id, pagoId));
  await recalcularEstado(tx, fila.op);
  return { operacionId: fila.op.id, borrados } as const;
}

/** Lleva al balance del cliente una partida que no mueve banco (p. ej. una comisión). */
export async function partidaAlBalanceEnTx(tx: Tx, partidaId: number, datos: { fecha: string; usuarioId: number }) {
  const [fila] = await tx
    .select({ p: s.partidas, op: s.operaciones })
    .from(s.partidas)
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .where(eq(s.partidas.id, partidaId))
    .for("update");
  if (!fila) return { error: "No existe la partida." } as const;
  const { p, op } = fila;
  if (CERRADAS.includes(op.estado)) return { error: "La operación está anulada o rechazada." } as const;
  if (p.clienteEn || p.ejecutadaEn) return { error: "Esta partida ya está en el balance." } as const;
  if (p.moneda && Number(p.importeCuenta)) return { error: "Esta partida mueve banco: se lleva al balance pago a pago." } as const;
  if (!op.subcuentaId || !Number(p.efectoCliente)) return { error: "Esta partida no afecta al cliente." } as const;
  await tx.insert(s.movimientos).values({
    fecha: datos.fecha,
    subcuentaId: op.subcuentaId,
    concepto: p.descripcion,
    detalle: detalleMovimiento(op),
    importe: p.efectoCliente!,
    origen: "operacion",
    partidaId: p.id,
    creadoPor: datos.usuarioId,
  });
  await tx.update(s.partidas).set({ clienteEn: datos.fecha, clientePor: datos.usuarioId }).where(eq(s.partidas.id, p.id));
  await recalcularEstado(tx, op);
  return { operacionId: op.id } as const;
}

export async function revertirBalancePartidaEnTx(tx: Tx, partidaId: number) {
  const [fila] = await tx
    .select({ p: s.partidas, op: s.operaciones })
    .from(s.partidas)
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .where(eq(s.partidas.id, partidaId))
    .for("update");
  if (!fila) return { error: "No existe la partida." } as const;
  if (!fila.p.clienteEn) return { error: "Esta partida no está en el balance." } as const;
  const borrados = await tx
    .delete(s.movimientos)
    .where(and(eq(s.movimientos.partidaId, partidaId), isNull(s.movimientos.pagoId), isNotNull(s.movimientos.subcuentaId)))
    .returning();
  await tx.update(s.partidas).set({ clienteEn: null, clientePor: null }).where(eq(s.partidas.id, partidaId));
  await recalcularEstado(tx, fila.op);
  return { operacionId: fila.op.id, borrados } as const;
}

/** Cierra una partida aunque lo pagado no coincida con lo instruido (con una nota). */
export async function cerrarPartidaEnTx(tx: Tx, partidaId: number, datos: { fecha: string; nota: string }) {
  const [fila] = await tx
    .select({ p: s.partidas, op: s.operaciones })
    .from(s.partidas)
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .where(eq(s.partidas.id, partidaId))
    .for("update");
  if (!fila) return { error: "No existe la partida." } as const;
  if (fila.p.cerradaEn || fila.p.ejecutadaEn) return { error: "La partida ya está cerrada." } as const;
  await tx.update(s.partidas).set({ cerradaEn: datos.fecha, cerradaNota: datos.nota }).where(eq(s.partidas.id, partidaId));
  await recalcularEstado(tx, fila.op);
  return { operacionId: fila.op.id } as const;
}

/** Uso del límite interbancario de cada cuenta en un día (solo salidas marcadas como interbancarias). */
export async function usoLimites(fecha: string) {
  const usado = sql<string>`coalesce((select -sum(${s.pagos.importe}) from ${s.pagos}
    where ${s.pagos.cuentaId} = ${s.cuentas.id} and ${s.pagos.fecha} = ${fecha} and ${s.pagos.interbancario} and ${s.pagos.importe} < 0), 0)`;
  const filas = await db
    .select({
      id: s.cuentas.id,
      nombre: s.cuentas.nombre,
      entidad: s.cuentas.entidad,
      moneda: s.cuentas.moneda,
      limite: s.cuentas.limiteInterbancario,
      usado,
    })
    .from(s.cuentas)
    .where(and(eq(s.cuentas.activa, true), isNotNull(s.cuentas.limiteInterbancario), gt(s.cuentas.limiteInterbancario, "0")))
    .orderBy(asc(s.cuentas.nombre));
  return filas.map((f) => {
    const limite = Number(f.limite);
    const u = Number(f.usado);
    return { ...f, limite, usado: u, disponible: r2(limite - u), pct: limite > 0 ? u / limite : 0 };
  });
}

/** Comprueba si un pago interbancario pasa del límite del día (solo aviso). */
export async function avisoLimite(cuentaId: number, fecha: string, monto: number) {
  const fila = (await usoLimites(fecha)).find((c) => c.id === cuentaId);
  if (!fila || monto <= fila.disponible + TOLERANCIA) return null;
  return `Ojo: con este pago ${fila.nombre} pasa su límite interbancario del día (disponible ${fila.disponible.toLocaleString("es-VE", { minimumFractionDigits: 2 })}).`;
}
