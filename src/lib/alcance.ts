import "server-only";
import { and, eq, exists, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clientes, subcuentas } from "@/db/schema";
import type { UsuarioActual } from "./auth";

/** Ejecutivo responsable de una subcuenta: el suyo propio o, si no tiene, el del cliente. */
export const ejecutivoDeSubcuenta = sql<number | null>`coalesce(${subcuentas.ejecutivoId}, ${clientes.ejecutivoId})`;

/**
 * Filtro de subcuentas visibles (consulta con join a clientes).
 * Un ejecutivo ve solo su cartera; un cliente, solo las suyas.
 */
export function filtroSubcuentas(usuario: UsuarioActual): SQL | undefined {
  switch (usuario.rol) {
    case "ejecutivo":
      return eq(ejecutivoDeSubcuenta, usuario.ejecutivoId ?? -1);
    case "cliente":
      return eq(subcuentas.clienteId, usuario.clienteId ?? -1);
    default:
      return undefined;
  }
}

/** Filtro de clientes visibles: los que tienen alguna subcuenta visible. */
export function filtroClientes(usuario: UsuarioActual): SQL | undefined {
  switch (usuario.rol) {
    case "ejecutivo":
      return or(
        eq(clientes.ejecutivoId, usuario.ejecutivoId ?? -1),
        exists(
          db
            .select({ uno: sql`1` })
            .from(subcuentas)
            .where(
              and(
                eq(subcuentas.clienteId, clientes.id),
                eq(subcuentas.ejecutivoId, usuario.ejecutivoId ?? -1),
              ),
            ),
        ),
      );
    case "cliente":
      return eq(clientes.id, usuario.clienteId ?? -1);
    default:
      return undefined;
  }
}

/** Quién puede crear y editar clientes y subcuentas. */
export const puedeEditarClientes = (usuario: UsuarioActual) =>
  usuario.rol === "admin" || usuario.rol === "operadora";

/** Ejecutivo responsable de una subcuenta (el suyo o el de su cliente). */
export async function ejecutivoDe(subcuentaId: number | null): Promise<number | null> {
  if (!subcuentaId) return null;
  const [fila] = await db
    .select({ id: ejecutivoDeSubcuenta })
    .from(subcuentas)
    .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
    .where(eq(subcuentas.id, subcuentaId));
  return fila?.id ?? null;
}
