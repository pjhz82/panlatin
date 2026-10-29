import "server-only";
import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { ejecutivos, operaciones, subcuentas, type TipoOperacion } from "@/db/schema";

export type FiltroOperaciones = {
  desde: string;
  hasta: string;
  tipo?: TipoOperacion;
  ejecutivoId?: number;
};

/** Operaciones válidas del periodo: las rechazadas y anuladas no cuentan. */
function condicion(f: FiltroOperaciones): SQL {
  return and(
    gte(operaciones.fecha, f.desde),
    lte(operaciones.fecha, f.hasta),
    inArray(operaciones.estado, ["completada", "en_ejecucion", "aprobada", "pendiente_firmas"]),
    f.tipo ? eq(operaciones.tipo, f.tipo) : undefined,
    f.ejecutivoId ? eq(operaciones.ejecutivoId, f.ejecutivoId) : undefined,
  )!;
}

const n = (v: string | number | null) => Number(v ?? 0);
const usdDe = (tipo: TipoOperacion) => sql<string>`coalesce(sum(${operaciones.montoUsd}) filter (where ${operaciones.tipo} = ${tipo}), 0)`;
/** Tasa media ponderada (Bs. / US$) de las operaciones de un tipo con tasa. */
const tasaDe = (tipo: TipoOperacion) =>
  sql<string | null>`sum(${operaciones.montoBs}) filter (where ${operaciones.tipo} = ${tipo} and ${operaciones.tasa} > 0)
    / nullif(sum(${operaciones.montoUsd}) filter (where ${operaciones.tipo} = ${tipo} and ${operaciones.tasa} > 0), 0)`;

const columnasResumen = {
  operaciones: sql<number>`count(*)`.mapWith(Number),
  pendientes: sql<number>`count(*) filter (where ${operaciones.estado} = 'pendiente_firmas')`.mapWith(Number),
  compras: usdDe("compra"),
  ventas: usdDe("venta"),
  swaps: usdDe("swap"),
  bs: sql<string>`coalesce(sum(${operaciones.montoBs}), 0)`,
  utilidad: sql<string>`coalesce(sum(${operaciones.utilidad}), 0)`,
  tasaCompra: tasaDe("compra"),
  tasaVenta: tasaDe("venta"),
  clientes: sql<number>`count(distinct ${operaciones.subcuentaId})`.mapWith(Number),
};

type FilaResumen = { [K in keyof typeof columnasResumen]: unknown };
const limpiar = (r: FilaResumen) => ({
  operaciones: n(r.operaciones as number),
  pendientes: n(r.pendientes as number),
  compras: n(r.compras as string),
  ventas: n(r.ventas as string),
  swaps: n(r.swaps as string),
  bs: n(r.bs as string),
  utilidad: n(r.utilidad as string),
  tasaCompra: r.tasaCompra === null ? null : n(r.tasaCompra as string),
  tasaVenta: r.tasaVenta === null ? null : n(r.tasaVenta as string),
  clientes: n(r.clientes as number),
});
export type Resumen = ReturnType<typeof limpiar>;

export async function panelOperaciones(f: FiltroOperaciones) {
  const donde = condicion(f);
  const dia = sql<string>`to_char(${operaciones.fecha}, 'YYYY-MM-DD')`;
  const [[total], porDia, porEjecutivo, porTipo, topClientes, lista] = await Promise.all([
    db.select(columnasResumen).from(operaciones).where(donde),
    db.select({ dia, ...columnasResumen }).from(operaciones).where(donde).groupBy(dia).orderBy(dia),
    db
      .select({ ejecutivo: ejecutivos.codigo, ...columnasResumen })
      .from(operaciones)
      .leftJoin(ejecutivos, eq(ejecutivos.id, operaciones.ejecutivoId))
      .where(donde)
      .groupBy(ejecutivos.codigo)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        tipo: operaciones.tipo,
        operaciones: sql<number>`count(*)`.mapWith(Number),
        usd: sql<string>`coalesce(sum(${operaciones.montoUsd}), 0)`,
        utilidad: sql<string>`coalesce(sum(${operaciones.utilidad}), 0)`,
      })
      .from(operaciones)
      .where(donde)
      .groupBy(operaciones.tipo)
      .orderBy(sql`sum(${operaciones.montoUsd}) desc nulls last`),
    db
      .select({
        id: subcuentas.id,
        nombre: sql<string>`coalesce(${subcuentas.nombre}, ${operaciones.descripcion}, 'Sin cliente')`,
        operaciones: sql<number>`count(*)`.mapWith(Number),
        usd: sql<string>`coalesce(sum(${operaciones.montoUsd}), 0)`,
        utilidad: sql<string>`coalesce(sum(${operaciones.utilidad}), 0)`,
      })
      .from(operaciones)
      .leftJoin(subcuentas, eq(subcuentas.id, operaciones.subcuentaId))
      .where(donde)
      .groupBy(subcuentas.id, sql`coalesce(${subcuentas.nombre}, ${operaciones.descripcion}, 'Sin cliente')`)
      .orderBy(sql`sum(${operaciones.montoUsd}) desc nulls last`)
      .limit(10),
    db
      .select({
        id: operaciones.id,
        fecha: operaciones.fecha,
        tipo: operaciones.tipo,
        estado: operaciones.estado,
        origen: operaciones.origen,
        subcuentaId: operaciones.subcuentaId,
        cliente: sql<string | null>`coalesce(${subcuentas.nombre}, ${operaciones.descripcion})`,
        contraparte: operaciones.contraparte,
        ejecutivo: ejecutivos.codigo,
        montoUsd: operaciones.montoUsd,
        tasa: operaciones.tasa,
        montoBs: operaciones.montoBs,
        utilidad: operaciones.utilidad,
      })
      .from(operaciones)
      .leftJoin(subcuentas, eq(subcuentas.id, operaciones.subcuentaId))
      .leftJoin(ejecutivos, eq(ejecutivos.id, operaciones.ejecutivoId))
      .where(donde)
      .orderBy(sql`${operaciones.fecha} desc, ${operaciones.id} desc`)
      .limit(300),
  ]);
  return {
    total: limpiar(total),
    porDia: porDia.map((d) => ({ dia: d.dia, ...limpiar(d) })),
    porEjecutivo: porEjecutivo.map((e) => ({ ejecutivo: e.ejecutivo ?? "Sin ejecutivo", ...limpiar(e) })),
    porTipo: porTipo.map((t) => ({ ...t, usd: n(t.usd), utilidad: n(t.utilidad) })),
    topClientes: topClientes.map((c) => ({ ...c, usd: n(c.usd), utilidad: n(c.utilidad) })),
    lista,
  };
}
