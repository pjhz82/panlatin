import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { cambios, cuentas, ejecutivos, operaciones, pagos, partidas, subcuentas, usuarios, type EstadoOperacion } from "@/db/schema";
import { esSalidaDeDolares } from "./operaciones";
import { partidasConAvance, resumenAvance, usoLimites, type PartidaConAvance } from "./pagos";

export const ABIERTAS: EstadoOperacion[] = ["pendiente_firmas", "aprobada", "en_ejecucion"];

/** Operaciones web con sus datos de cabecera. */
export async function operacionesConAvance(estados: EstadoOperacion[] | null, limite = 300, extra?: SQL) {
  const ops = await db
    .select({
      id: operaciones.id,
      fecha: operaciones.fecha,
      tipo: operaciones.tipo,
      estado: operaciones.estado,
      descripcion: operaciones.descripcion,
      montoUsd: operaciones.montoUsd,
      tasa: operaciones.tasa,
      subcuentaId: operaciones.subcuentaId,
      cliente: subcuentas.nombre,
      ejecutivoId: operaciones.ejecutivoId,
      ejecutivo: ejecutivos.codigo,
      cambioPendiente: sql<boolean>`exists (select 1 from ${cambios} where ${cambios.operacionId} = ${operaciones.id} and ${cambios.estado} = 'pendiente')`,
    })
    .from(operaciones)
    .leftJoin(subcuentas, eq(subcuentas.id, operaciones.subcuentaId))
    .leftJoin(ejecutivos, eq(ejecutivos.id, operaciones.ejecutivoId))
    .where(and(eq(operaciones.origen, "web"), estados ? inArray(operaciones.estado, estados) : undefined, extra))
    .orderBy(desc(operaciones.fecha), desc(operaciones.id))
    .limit(limite);
  const lista = await partidasConAvance(db, ops.map((o) => o.id));
  const porOp = new Map<number, PartidaConAvance[]>();
  for (const p of lista) porOp.set(p.operacionId, [...(porOp.get(p.operacionId) ?? []), p]);
  return ops.map((o) => {
    const ps = porOp.get(o.id) ?? [];
    const r = resumenAvance(ps);
    const esperando: string[] = [];
    if (o.estado === "pendiente_firmas") esperando.push("Aprobación US$");
    if (o.cambioPendiente) esperando.push("Aprobación de cambio");
    if (r.porPagar && !(o.estado === "pendiente_firmas" && ps.filter((p) => !p.avance.pagada).every((p) => esSalidaDeDolares(p.importe, p.moneda)))) {
      esperando.push("Pagos");
    }
    if (r.porBalance) esperando.push("Balance (Beisy)");
    return { ...o, partidas: ps, ...r, esperando };
  });
}
export type OperacionConAvance = Awaited<ReturnType<typeof operacionesConAvance>>[number];

/** Módulo 2: partidas con pagos por enviar o recibir. */
export async function pendientesDePago() {
  const ops = await operacionesConAvance(ABIERTAS, 1000);
  return ops.flatMap((o) =>
    o.partidas
      .filter((p) => p.avance.ladoBanco && !p.avance.pagada)
      .map((p) => ({
        op: o,
        partida: p,
        bloqueada: o.estado === "pendiente_firmas" && esSalidaDeDolares(p.importe, p.moneda),
      })),
  );
}

/** Cuentas activas con lo que les queda del límite interbancario de hoy. */
export async function cuentasParaPagos(fecha: string) {
  const [lista, limites] = await Promise.all([
    db
      .select({ id: cuentas.id, nombre: cuentas.nombre, moneda: cuentas.moneda, entidad: cuentas.entidad })
      .from(cuentas)
      .where(eq(cuentas.activa, true))
      .orderBy(asc(cuentas.nombre)),
    usoLimites(fecha),
  ]);
  const disp = new Map(limites.map((l) => [l.id, l.disponible]));
  return { cuentas: lista.map((c) => ({ ...c, disponible: disp.get(c.id) ?? null })), limites };
}

const reporto = alias(usuarios, "reporto");
const reviso = alias(usuarios, "reviso");

/** Pagos reportados (para revisar y corregir), del más reciente al más antiguo. */
export async function pagosReportados(desde: string, extra?: ReturnType<typeof and>) {
  return db
    .select({
      id: pagos.id,
      fecha: pagos.fecha,
      importe: pagos.importe,
      efectoCliente: pagos.efectoCliente,
      referencia: pagos.referencia,
      interbancario: pagos.interbancario,
      comisionBanco: pagos.comisionBanco,
      balanceEn: pagos.balanceEn,
      cuenta: cuentas.nombre,
      moneda: cuentas.moneda,
      partida: partidas.descripcion,
      destino: partidas.destino,
      operacionId: operaciones.id,
      subcuentaId: operaciones.subcuentaId,
      cliente: subcuentas.nombre,
      reporto: reporto.nombre,
      reviso: reviso.nombre,
    })
    .from(pagos)
    .innerJoin(cuentas, eq(cuentas.id, pagos.cuentaId))
    .innerJoin(partidas, eq(partidas.id, pagos.partidaId))
    .innerJoin(operaciones, eq(operaciones.id, partidas.operacionId))
    .leftJoin(subcuentas, eq(subcuentas.id, operaciones.subcuentaId))
    .innerJoin(reporto, eq(reporto.id, pagos.reportadoPor))
    .leftJoin(reviso, eq(reviso.id, pagos.balancePor))
    .where(and(gte(pagos.fecha, desde), extra))
    .orderBy(desc(pagos.fecha), desc(pagos.id))
    .limit(300);
}

/** Módulo 3: lo pagado que falta llevar al balance del cliente, y las partidas sin banco. */
export async function pendientesDeBalance() {
  const [porPago, ops] = await Promise.all([
    pagosReportados("1900-01-01", and(isNull(pagos.balanceEn), ne(pagos.efectoCliente, "0"))),
    operacionesConAvance(ABIERTAS, 1000),
  ]);
  const sinBanco = ops.flatMap((o) =>
    o.partidas.filter((p) => p.avance.ladoCliente && !p.avance.ladoBanco && p.avance.pendienteBalance).map((p) => ({ op: o, partida: p })),
  );
  return { porPago, sinBanco };
}

/** Fecha (YYYY-MM-DD) de hace `n` días. */
export const haceDias = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/**
 * Operaciones de un cliente para su portal: las abiertas y las completadas en
 * los últimos 30 días, de las subcuentas que puede ver.
 */
export async function operacionesDeCliente(clienteId: number) {
  return operacionesConAvance(
    [...ABIERTAS, "completada"],
    100,
    and(
      inArray(operaciones.subcuentaId, db.select({ id: subcuentas.id }).from(subcuentas).where(eq(subcuentas.clienteId, clienteId))),
      or(inArray(operaciones.estado, ABIERTAS), gte(operaciones.fecha, haceDias(30))),
    ),
  );
}
