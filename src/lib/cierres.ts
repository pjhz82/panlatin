import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Balance consolidado de cada día entre dos fechas, calculado con los
 * movimientos registrados (una sola consulta). Mismos criterios que el balance:
 * USDT/USDC 1:1, bolívares con la tasa dada e incobrables provisionados según
 * su marca actual.
 */
export async function balancesDiarios(desde: string, hasta: string, tasa: number) {
  const { rows } = await db.execute<{
    fecha: string;
    disponible_usd: string;
    bancos_bs: string;
    por_cobrar: string;
    provision: string;
    por_pagar: string;
  }>(sql`
    with dias as (
      select generate_series(${desde}::date, ${hasta}::date, interval '1 day')::date as d
    ),
    tesoreria as (
      select d.d,
             coalesce(sum(m.importe) filter (where c.moneda <> 'BS'), 0) as disponible_usd,
             coalesce(sum(m.importe) filter (where c.moneda = 'BS'), 0) as bancos_bs
      from dias d
      left join movimientos m on m.cuenta_id is not null and m.fecha <= d.d
      left join cuentas c on c.id = m.cuenta_id
      group by d.d
    ),
    por_sub as (
      select subcuenta_id, fecha, sum(importe) as imp from movimientos where subcuenta_id is not null group by 1, 2
    ),
    saldos as (
      select d.d, p.subcuenta_id, sum(p.imp) as saldo
      from dias d join por_sub p on p.fecha <= d.d
      group by d.d, p.subcuenta_id
    ),
    clientes_dia as (
      select s.d,
             coalesce(-sum(s.saldo) filter (where s.saldo < -0.005), 0) as por_cobrar,
             coalesce(-sum(s.saldo) filter (where s.saldo < -0.005 and cl.riesgo = 'incobrable'), 0) as provision,
             coalesce(sum(s.saldo) filter (where s.saldo > 0.005), 0) as por_pagar
      from saldos s
      join subcuentas sc on sc.id = s.subcuenta_id
      join clientes cl on cl.id = sc.cliente_id
      group by s.d
    )
    select to_char(t.d, 'YYYY-MM-DD') as fecha, t.disponible_usd, t.bancos_bs,
           coalesce(c.por_cobrar, 0) as por_cobrar, coalesce(c.provision, 0) as provision, coalesce(c.por_pagar, 0) as por_pagar
    from tesoreria t left join clientes_dia c on c.d = t.d
    order by t.d
  `);
  return rows.map((r) => {
    const disponibleUsd = Number(r.disponible_usd);
    const bancosBs = Number(r.bancos_bs);
    const bsEnUsd = bancosBs / tasa;
    const porCobrar = Number(r.por_cobrar);
    const provisionIncobrables = Number(r.provision);
    const porPagar = Number(r.por_pagar);
    return {
      fecha: r.fecha,
      disponibleUsd,
      bancosBs,
      bsEnUsd,
      porCobrar,
      provisionIncobrables,
      porPagar,
      patrimonio: disponibleUsd + bsEnUsd + porCobrar - provisionIncobrables - porPagar,
    };
  });
}
