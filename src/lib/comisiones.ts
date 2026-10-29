import "server-only";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { ejecutivos, operaciones, subcuentas } from "@/db/schema";

/**
 * Comisiones de los ejecutivos: la comisión (utilidad) de cada operación es
 * del ejecutivo del cliente. Cuenta como ganada cuando la operación está
 * completada; si sigue abierta, está en curso. Las anuladas y rechazadas no cuentan.
 */
export async function comisionesPorEjecutivo(desde: string, hasta: string, ejecutivoId?: number) {
  // Solo operaciones de la web: en las históricas del Excel la utilidad no sigue el mismo criterio de signo.
  const periodo = and(
    eq(operaciones.origen, "web"),
    gte(operaciones.fecha, desde),
    lte(operaciones.fecha, hasta),
    inArray(operaciones.estado, ["completada", "en_ejecucion", "aprobada", "pendiente_firmas"]),
  );
  const ganada = sql<string>`coalesce(sum(${operaciones.utilidad}) filter (where ${operaciones.estado} = 'completada'), 0)`;
  const enCurso = sql<string>`coalesce(sum(${operaciones.utilidad}) filter (where ${operaciones.estado} <> 'completada'), 0)`;
  const [resumen, lista] = await Promise.all([
    db
      .select({
        id: ejecutivos.id,
        codigo: ejecutivos.codigo,
        nombre: ejecutivos.nombre,
        operaciones: sql<number>`count(${operaciones.id})`.mapWith(Number),
        ganada,
        enCurso,
      })
      .from(ejecutivos)
      .leftJoin(operaciones, and(eq(operaciones.ejecutivoId, ejecutivos.id), periodo))
      .groupBy(ejecutivos.id)
      .orderBy(sql`coalesce(sum(${operaciones.utilidad}), 0) desc`, ejecutivos.codigo),
    db
      .select({
        id: operaciones.id,
        fecha: operaciones.fecha,
        tipo: operaciones.tipo,
        estado: operaciones.estado,
        origen: operaciones.origen,
        cliente: sql<string | null>`coalesce(${subcuentas.nombre}, ${operaciones.descripcion})`,
        ejecutivo: ejecutivos.codigo,
        montoUsd: operaciones.montoUsd,
        utilidad: operaciones.utilidad,
      })
      .from(operaciones)
      .innerJoin(ejecutivos, eq(ejecutivos.id, operaciones.ejecutivoId))
      .leftJoin(subcuentas, eq(subcuentas.id, operaciones.subcuentaId))
      .where(and(periodo, sql`coalesce(${operaciones.utilidad}, 0) <> 0`, ejecutivoId ? eq(operaciones.ejecutivoId, ejecutivoId) : undefined))
      .orderBy(desc(operaciones.fecha), desc(operaciones.id))
      .limit(500),
  ]);
  return {
    resumen: resumen.map((r) => ({ ...r, ganada: Number(r.ganada), enCurso: Number(r.enCurso) })),
    lista,
  };
}
