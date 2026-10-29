import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { RiesgoCliente } from "@/db/schema";
import type { UsuarioActual } from "./auth";
import { tramoDe } from "./riesgo";

export type CuentaPorCobrar = {
  subcuentaId: number;
  subcuenta: string;
  clienteId: number;
  cliente: string;
  ejecutivo: string | null;
  riesgo: RiesgoCliente;
  diasCredito: number | null;
  saldo: number;
  /** Desde cuándo la subcuenta está en negativo sin interrupción. */
  inicioDeuda: string;
  dias: number;
  vence: string | null;
  diasVencido: number;
  tramo: ReturnType<typeof tramoDe>;
};

const DIA = 86_400_000;

/**
 * Subcuentas con saldo por cobrar a hoy, con la antigüedad de la deuda. Si el
 * cliente tiene plazo, se vence a los N días del inicio de la deuda; si no,
 * cuenta desde el inicio.
 */
export async function cuentasPorCobrar(usuario: UsuarioActual): Promise<CuentaPorCobrar[]> {
  const soloEjecutivo = usuario.rol === "ejecutivo" ? (usuario.ejecutivoId ?? -1) : null;
  const { rows } = await db.execute<{
    subcuenta_id: number;
    subcuenta: string;
    cliente_id: number;
    cliente: string;
    ejecutivo: string | null;
    riesgo: RiesgoCliente;
    dias_credito: number | null;
    saldo: string;
    inicio: string;
  }>(sql`
    with m as (
      select subcuenta_id, fecha, id,
             sum(importe) over (partition by subcuenta_id order by fecha, id) as saldo
      from movimientos
      where subcuenta_id is not null and fecha <= current_date
    ),
    c as (
      select subcuenta_id, fecha, saldo,
             lag(saldo) over (partition by subcuenta_id order by fecha, id) as anterior
      from m
    ),
    ultimo as (
      select distinct on (subcuenta_id) subcuenta_id, saldo from m order by subcuenta_id, fecha desc, id desc
    ),
    inicio as (
      select subcuenta_id, max(fecha) as inicio from c
      where saldo < -0.005 and coalesce(anterior, 0) >= -0.005
      group by subcuenta_id
    )
    select s.id as subcuenta_id, s.nombre as subcuenta, cl.id as cliente_id, cl.nombre as cliente,
           e.codigo as ejecutivo, cl.riesgo, cl.dias_credito, u.saldo, to_char(i.inicio, 'YYYY-MM-DD') as inicio
    from ultimo u
    join inicio i using (subcuenta_id)
    join subcuentas s on s.id = u.subcuenta_id
    join clientes cl on cl.id = s.cliente_id
    left join ejecutivos e on e.id = coalesce(s.ejecutivo_id, cl.ejecutivo_id)
    where u.saldo < -0.005
      and (${soloEjecutivo}::int is null or coalesce(s.ejecutivo_id, cl.ejecutivo_id) = ${soloEjecutivo}::int)
  `);
  const hoy = Date.parse(new Date().toISOString().slice(0, 10));
  return rows
    .map((r) => {
      const inicio = Date.parse(r.inicio);
      const vence = r.dias_credito === null ? null : inicio + r.dias_credito * DIA;
      const diasVencido = Math.round((hoy - (vence ?? inicio)) / DIA);
      return {
        subcuentaId: r.subcuenta_id,
        subcuenta: r.subcuenta,
        clienteId: r.cliente_id,
        cliente: r.cliente,
        ejecutivo: r.ejecutivo,
        riesgo: r.riesgo,
        diasCredito: r.dias_credito,
        saldo: -Number(r.saldo),
        inicioDeuda: r.inicio,
        dias: Math.round((hoy - inicio) / DIA),
        vence: vence === null ? null : new Date(vence).toISOString().slice(0, 10),
        diasVencido,
        tramo: tramoDe(diasVencido),
      };
    })
    .sort((a, b) => b.saldo - a.saldo);
}
