import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type FilaRevision = {
  tipo: "subcuenta" | "cuenta";
  id: number;
  nombre: string;
  hoja: string;
  movimientosExcel: number;
  movimientos: number;
  saldoExcel: number | null;
  saldo: number;
  cuadra: boolean | null;
};

/** Compara el saldo de cada estado de cuenta importado con el que mostraba su hoja de Excel. */
export async function revisionExcel(): Promise<FilaRevision[]> {
  const { rows } = await db.execute<{
    tipo: "subcuenta" | "cuenta";
    id: number;
    nombre: string;
    hoja: string;
    movimientos_excel: number;
    movimientos: string;
    saldo_excel: string | null;
    saldo: string;
  }>(sql`
    select case when r.subcuenta_id is not null then 'subcuenta' else 'cuenta' end as tipo,
           coalesce(r.subcuenta_id, r.cuenta_id) as id,
           coalesce(s.nombre, c.nombre) as nombre,
           r.hoja, r.movimientos as movimientos_excel, r.saldo as saldo_excel,
           (select count(*) from movimientos m
             where m.subcuenta_id = r.subcuenta_id or m.cuenta_id = r.cuenta_id) as movimientos,
           (select coalesce(sum(m.importe), 0) from movimientos m
             where m.subcuenta_id = r.subcuenta_id or m.cuenta_id = r.cuenta_id) as saldo
    from referencias_excel r
    left join subcuentas s on s.id = r.subcuenta_id
    left join cuentas c on c.id = r.cuenta_id
    order by 3
  `);
  return rows.map((r) => {
    const saldo = Number(r.saldo);
    const saldoExcel = r.saldo_excel === null ? null : Number(r.saldo_excel);
    return {
      tipo: r.tipo,
      id: r.id,
      nombre: r.nombre,
      hoja: r.hoja,
      movimientosExcel: r.movimientos_excel,
      movimientos: Number(r.movimientos),
      saldoExcel,
      saldo,
      cuadra: saldoExcel === null ? null : Math.abs(saldo - saldoExcel) < 0.05,
    };
  });
}
