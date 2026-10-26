import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import * as s from "../db/schema";

/** Formato del archivo de catálogos (empresas, ejecutivos, clientes y cuentas). */
export const esquemaCatalogos = z.object({
  empresas: z.array(z.string().min(1)),
  ejecutivos: z.array(z.string().min(1)),
  clientes: z.array(
    z.object({
      nombre: z.string().min(1),
      ejecutivo: z.string().nullable(),
      subcuentas: z.array(z.object({ nombre: z.string().min(1), ejecutivo: z.string().nullable() })),
    }),
  ),
  cuentas: z.array(
    z.object({
      nombre: z.string().min(1),
      tipo: z.enum(s.tipoCuenta.enumValues),
      moneda: z.enum(s.moneda.enumValues),
      empresa: z.string().optional(),
      entidad: z.string().optional(),
      red: z.enum(s.redBlockchain.enumValues).optional(),
      direccion: z.string().optional(),
    }),
  ),
});

export type Catalogos = z.infer<typeof esquemaCatalogos>;

export type ResultadoImportacion = {
  empresas: number;
  ejecutivos: number;
  clientes: number;
  subcuentas: number;
  cuentas: number;
};

type Db = Pick<NodePgDatabase<typeof s>, "insert" | "select">;

/**
 * Carga los catálogos. Se puede repetir: lo que ya existe (mismo nombre o
 * misma dirección de wallet) no se toca. Devuelve cuántos registros son nuevos.
 */
export async function importarCatalogos(tx: Db, datos: Catalogos): Promise<ResultadoImportacion> {
  const empresas = datos.empresas.length
    ? await tx
        .insert(s.empresas)
        .values(datos.empresas.map((nombre) => ({ nombre })))
        .onConflictDoNothing()
        .returning({ id: s.empresas.id })
    : [];
  const ejecutivos = datos.ejecutivos.length
    ? await tx
        .insert(s.ejecutivos)
        .values(datos.ejecutivos.map((codigo) => ({ codigo, nombre: codigo })))
        .onConflictDoNothing()
        .returning({ id: s.ejecutivos.id })
    : [];

  const idEmpresa = new Map((await tx.select().from(s.empresas)).map((e) => [e.nombre, e.id]));
  const idEjecutivo = new Map((await tx.select().from(s.ejecutivos)).map((e) => [e.codigo, e.id]));
  const ejecutivo = (codigo: string | null) => (codigo ? (idEjecutivo.get(codigo) ?? null) : null);

  let clientes = 0;
  let subcuentas = 0;
  for (const c of datos.clientes) {
    const [creado] = await tx
      .insert(s.clientes)
      .values({ nombre: c.nombre, ejecutivoId: ejecutivo(c.ejecutivo) })
      .onConflictDoNothing()
      .returning({ id: s.clientes.id });
    if (creado) clientes++;
    const clienteId =
      creado?.id ??
      (await tx.select({ id: s.clientes.id }).from(s.clientes).where(eq(s.clientes.nombre, c.nombre)))[0].id;
    if (c.subcuentas.length === 0) continue;
    const insertadas = await tx
      .insert(s.subcuentas)
      .values(c.subcuentas.map((sc) => ({ clienteId, nombre: sc.nombre, ejecutivoId: ejecutivo(sc.ejecutivo) })))
      .onConflictDoNothing()
      .returning({ id: s.subcuentas.id });
    subcuentas += insertadas.length;
  }

  const cuentas = datos.cuentas.length
    ? await tx
        .insert(s.cuentas)
        .values(
          datos.cuentas.map((c) => ({
            nombre: c.nombre,
            tipo: c.tipo,
            moneda: c.moneda,
            empresaId: c.empresa ? (idEmpresa.get(c.empresa) ?? null) : null,
            entidad: c.entidad ?? null,
            red: c.red ?? null,
            direccion: c.direccion ?? null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: s.cuentas.id })
    : [];

  return {
    empresas: empresas.length,
    ejecutivos: ejecutivos.length,
    clientes,
    subcuentas,
    cuentas: cuentas.length,
  };
}
