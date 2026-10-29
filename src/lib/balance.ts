import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import type { UsuarioActual } from "./auth";
import { saldosCuentas, saldosSubcuentas, type SaldoCuenta } from "./datos";

/**
 * Balance del holding a una fecha de corte. La tasa (Bs. por US$) convierte los
 * bancos en bolívares; sin tasa no se suman. Lo que deben los clientes
 * incobrables se provisiona (se resta del activo).
 */
export async function calcularBalance(opciones: {
  usuario: UsuarioActual;
  corte: string;
  tasa: number | null;
  empresaId?: number | null;
}) {
  const { corte, tasa, empresaId } = opciones;
  const [todasCuentas, subs] = await Promise.all([saldosCuentas(corte), saldosSubcuentas(opciones.usuario, undefined, corte)]);
  const ctas = empresaId ? todasCuentas.filter((c) => c.empresaId === empresaId) : todasCuentas;
  const total = (lista: SaldoCuenta[]) => lista.reduce((t, c) => t + c.saldo, 0);

  const bancosUsd = ctas.filter((c) => c.tipo === "banco" && c.moneda === "USD");
  const bancosBs = ctas.filter((c) => c.tipo === "banco" && c.moneda === "BS");
  const cajas = ctas.filter((c) => c.tipo === "caja");
  const wallets = ctas.filter((c) => c.tipo === "wallet");
  const exchanges = ctas.filter((c) => c.tipo === "exchange");

  const totalBs = total(bancosBs);
  const bsEnUsd = tasa ? totalBs / tasa : 0;
  const disponibleUsd = total(bancosUsd) + total(cajas) + total(wallets) + total(exchanges);
  const disponible = disponibleUsd + bsEnUsd;

  // Las cuentas de clientes son del holding, no de una empresa concreta.
  const deudores = empresaId ? [] : subs.filter((s) => s.saldo < -0.005).sort((a, b) => a.saldo - b.saldo);
  const acreedores = empresaId ? [] : subs.filter((s) => s.saldo > 0.005).sort((a, b) => b.saldo - a.saldo);
  const porCobrar = -deudores.reduce((t, s) => t + s.saldo, 0);
  const incobrables = deudores.filter((s) => s.riesgo === "incobrable");
  const provisionIncobrables = -incobrables.reduce((t, s) => t + s.saldo, 0);
  const altoRiesgo = -deudores.filter((s) => s.riesgo === "alto_riesgo").reduce((t, s) => t + s.saldo, 0);
  const porPagar = acreedores.reduce((t, s) => t + s.saldo, 0);
  const activo = disponible + porCobrar - provisionIncobrables;
  const patrimonio = activo - porPagar;

  return {
    corte,
    tasa,
    grupos: { bancosUsd, bancosBs, cajas, wallets, exchanges },
    totalBs,
    bsEnUsd,
    disponibleUsd,
    disponible,
    deudores,
    acreedores,
    porCobrar,
    provisionIncobrables,
    incobrables,
    altoRiesgo,
    porPagar,
    activo,
    patrimonio,
    total,
  };
}

export type Balance = Awaited<ReturnType<typeof calcularBalance>>;

/** Ids de clientes incobrables (para cálculos agregados por SQL). */
export async function clientesIncobrables(): Promise<number[]> {
  const filas = await db.select({ id: clientes.id }).from(clientes).where(inArray(clientes.riesgo, ["incobrable"]));
  return filas.map((f) => f.id);
}
