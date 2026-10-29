import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  clientes,
  cuentas,
  empresas,
  ejecutivos,
  movimientos,
  referenciasExcel,
  subcuentas,
  type Moneda,
  type RiesgoCliente,
} from "@/db/schema";
import type { UsuarioActual } from "./auth";
import { ejecutivoDeSubcuenta, filtroSubcuentas } from "./alcance";

/** Monedas que se suman como dólares en los totales (US$ y estables). */
export const MONEDAS_DOLAR: Moneda[] = ["USD", "USDT", "USDC"];

const suma = sql<string>`coalesce(sum(${movimientos.importe}), 0)`;

export type SaldoSubcuenta = {
  id: number;
  nombre: string;
  clienteId: number;
  cliente: string;
  riesgo: RiesgoCliente;
  ejecutivo: string | null;
  saldo: number;
  movimientos: number;
  ultimo: string | null;
};

/** Saldo de cada subcuenta visible para el usuario. Positivo = a favor del cliente; negativo = por cobrar. */
export async function saldosSubcuentas(
  usuario: UsuarioActual,
  extra?: SQL,
  /** Fecha de corte (incluida). Sin ella, el saldo de hoy con todo lo registrado. */
  hasta?: string,
): Promise<SaldoSubcuenta[]> {
  const ejecutivoEfectivo = ejecutivos.codigo;
  const filas = await db
    .select({
      id: subcuentas.id,
      nombre: subcuentas.nombre,
      clienteId: clientes.id,
      cliente: clientes.nombre,
      riesgo: clientes.riesgo,
      ejecutivo: ejecutivoEfectivo,
      saldo: suma,
      movimientos: sql<number>`count(${movimientos.id})`.mapWith(Number),
      ultimo: sql<string | null>`max(${movimientos.fecha})`,
    })
    .from(subcuentas)
    .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
    .leftJoin(ejecutivos, eq(ejecutivos.id, ejecutivoDeSubcuenta))
    .leftJoin(
      movimientos,
      and(eq(movimientos.subcuentaId, subcuentas.id), hasta ? lte(movimientos.fecha, hasta) : undefined),
    )
    .where(and(filtroSubcuentas(usuario), extra))
    .groupBy(subcuentas.id, clientes.id, ejecutivos.codigo)
    .orderBy(asc(subcuentas.nombre));
  return filas.map((f) => ({ ...f, saldo: Number(f.saldo) }));
}

export type SaldoCuenta = {
  id: number;
  nombre: string;
  tipo: string;
  moneda: Moneda;
  empresaId: number | null;
  empresa: string | null;
  activa: boolean;
  saldo: number;
  movimientos: number;
  ultimo: string | null;
};

export async function saldosCuentas(hasta?: string): Promise<SaldoCuenta[]> {
  const filas = await db
    .select({
      id: cuentas.id,
      nombre: cuentas.nombre,
      tipo: cuentas.tipo,
      moneda: cuentas.moneda,
      empresaId: cuentas.empresaId,
      empresa: empresas.nombre,
      activa: cuentas.activa,
      saldo: suma,
      movimientos: sql<number>`count(${movimientos.id})`.mapWith(Number),
      ultimo: sql<string | null>`max(${movimientos.fecha})`,
    })
    .from(cuentas)
    .leftJoin(empresas, eq(empresas.id, cuentas.empresaId))
    .leftJoin(
      movimientos,
      and(eq(movimientos.cuentaId, cuentas.id), hasta ? lte(movimientos.fecha, hasta) : undefined),
    )
    .groupBy(cuentas.id, empresas.nombre)
    .orderBy(asc(cuentas.nombre));
  return filas.map((f) => ({ ...f, saldo: Number(f.saldo) }));
}

const mes = sql<string>`to_char(date_trunc('month', ${movimientos.fecha}), 'YYYY-MM-01')`;

/** Últimos `n` meses (YYYY-MM-01), del más antiguo al actual. */
function ultimosMeses(n: number, hasta = new Date()) {
  const meses: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() - i, 1));
    meses.push(d.toISOString().slice(0, 10));
  }
  return meses;
}

/**
 * Entradas, salidas y saldo al cierre de cada mes de las cuentas de tesorería
 * en las monedas indicadas.
 */
export async function evolucionTesoreria(monedas: Moneda[], nMeses = 12) {
  const filas = await db
    .select({
      mes,
      entradas: sql<string>`coalesce(sum(${movimientos.importe}) filter (where ${movimientos.importe} > 0), 0)`,
      salidas: sql<string>`coalesce(-sum(${movimientos.importe}) filter (where ${movimientos.importe} < 0), 0)`,
      neto: suma,
    })
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuentaId))
    .where(inArray(cuentas.moneda, monedas))
    .groupBy(mes)
    .orderBy(asc(mes));
  return serieMensual(filas, nMeses);
}

/** Lo mismo para una sola subcuenta o cuenta. */
export async function evolucionDe(destino: Destino, nMeses = 12) {
  const filas = await db
    .select({
      mes,
      entradas: sql<string>`coalesce(sum(${movimientos.importe}) filter (where ${movimientos.importe} > 0), 0)`,
      salidas: sql<string>`coalesce(-sum(${movimientos.importe}) filter (where ${movimientos.importe} < 0), 0)`,
      neto: suma,
    })
    .from(movimientos)
    .where(condicionDestino(destino))
    .groupBy(mes)
    .orderBy(asc(mes));
  return serieMensual(filas, nMeses);
}

function serieMensual(filas: { mes: string; entradas: string; salidas: string; neto: string }[], nMeses: number) {
  const ultimo = filas.at(-1)?.mes;
  const meses = ultimosMeses(nMeses, ultimo ? new Date(`${ultimo}T00:00:00Z`) : new Date());
  const porMes = new Map(filas.map((f) => [f.mes, f]));
  // Saldo acumulado de todo lo anterior al primer mes mostrado.
  let saldo = filas.filter((f) => f.mes < meses[0]).reduce((a, f) => a + Number(f.neto), 0);
  return meses.map((m) => {
    const f = porMes.get(m);
    saldo += Number(f?.neto ?? 0);
    return { mes: m, entradas: Number(f?.entradas ?? 0), salidas: Number(f?.salidas ?? 0), saldo };
  });
}

export type Destino = { subcuentaId: number } | { cuentaId: number };

const condicionDestino = (d: Destino) =>
  "subcuentaId" in d ? eq(movimientos.subcuentaId, d.subcuentaId) : eq(movimientos.cuentaId, d.cuentaId);

export type FiltroMovimientos = { desde?: string; hasta?: string; q?: string; pagina: number };
export const POR_PAGINA = 100;

/** Estado de cuenta: movimientos con su saldo acumulado, del más reciente al más antiguo. */
export async function estadoDeCuenta(destino: Destino, filtro: FiltroMovimientos) {
  const conSaldo = db
    .select({
      id: movimientos.id,
      fecha: movimientos.fecha,
      concepto: movimientos.concepto,
      detalle: movimientos.detalle,
      formaPago: movimientos.formaPago,
      referencia: movimientos.referencia,
      nota: movimientos.nota,
      importe: movimientos.importe,
      saldo: sql<string>`sum(${movimientos.importe}) over (order by ${movimientos.fecha}, ${movimientos.id})`.as("saldo"),
    })
    .from(movimientos)
    .where(condicionDestino(destino))
    .as("con_saldo");

  const q = filtro.q?.trim();
  const condiciones = and(
    filtro.desde ? gte(conSaldo.fecha, filtro.desde) : undefined,
    filtro.hasta ? lte(conSaldo.fecha, filtro.hasta) : undefined,
    q
      ? sql`(${conSaldo.concepto} ilike ${`%${q}%`} or ${conSaldo.detalle} ilike ${`%${q}%`} or ${conSaldo.formaPago} ilike ${`%${q}%`} or ${conSaldo.referencia} ilike ${`%${q}%`})`
      : undefined,
  );

  const [filas, [totales]] = await Promise.all([
    db
      .select()
      .from(conSaldo)
      .where(condiciones)
      .orderBy(desc(conSaldo.fecha), desc(conSaldo.id))
      .limit(POR_PAGINA)
      .offset((filtro.pagina - 1) * POR_PAGINA),
    db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        abonos: sql<string>`coalesce(sum(${conSaldo.importe}) filter (where ${conSaldo.importe} > 0), 0)`,
        cargos: sql<string>`coalesce(-sum(${conSaldo.importe}) filter (where ${conSaldo.importe} < 0), 0)`,
      })
      .from(conSaldo)
      .where(condiciones),
  ]);
  return {
    filas: filas.map((f) => ({ ...f, importe: Number(f.importe), saldo: Number(f.saldo) })),
    total: totales.total,
    abonos: Number(totales.abonos),
    cargos: Number(totales.cargos),
  };
}

/** Saldo que mostraba la hoja de Excel al importarla (si existe). */
export async function referenciaExcel(destino: Destino) {
  const [r] = await db
    .select()
    .from(referenciasExcel)
    .where(
      "subcuentaId" in destino
        ? eq(referenciasExcel.subcuentaId, destino.subcuentaId)
        : eq(referenciasExcel.cuentaId, destino.cuentaId),
    )
    .limit(1);
  return r ? { hoja: r.hoja, saldo: r.saldo === null ? null : Number(r.saldo), cargadoEn: r.cargadoEn } : null;
}

/** Hoja del cliente (como en el Excel): todos los movimientos en orden cronológico con su saldo. */
export async function hojaDeCuenta(destino: Destino) {
  const filas = await db
    .select({
      id: movimientos.id,
      fecha: movimientos.fecha,
      concepto: movimientos.concepto,
      detalle: movimientos.detalle,
      formaPago: movimientos.formaPago,
      referencia: movimientos.referencia,
      nota: movimientos.nota,
      origen: movimientos.origen,
      importe: movimientos.importe,
      saldo: sql<string>`sum(${movimientos.importe}) over (order by ${movimientos.fecha}, ${movimientos.id})`,
    })
    .from(movimientos)
    .where(condicionDestino(destino))
    .orderBy(asc(movimientos.fecha), asc(movimientos.id));
  return filas.map((f) => ({ ...f, importe: Number(f.importe), saldo: Number(f.saldo) }));
}
