import { and, eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
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
  /** Cambios de nombre de clientes o subcuentas que ya existan (se aplican antes de importar). */
  renombrar: z
    .array(z.object({ tipo: z.enum(["cliente", "subcuenta"]), de: z.string(), a: z.string() }))
    .optional(),
  /** Usuarios nuevos con contraseña temporal (deberán cambiarla al entrar). */
  usuarios: z
    .array(
      z.object({
        usuario: z.string().min(2),
        nombre: z.string().min(1),
        rol: z.enum(s.rolUsuario.enumValues),
        ejecutivo: z.string().optional(),
        cliente: z.string().optional(),
        email: z.string().optional(),
        password: z.string().min(10),
      }),
    )
    .optional(),
  /** Estados de cuenta: por nombre de subcuenta o de cuenta de tesorería. */
  movimientos: z
    .object({
      subcuentas: z.record(z.string(), z.array(esquemaMovimiento())),
      cuentas: z.record(z.string(), z.array(esquemaMovimiento())),
    })
    .optional(),
  /** Saldo que mostraba cada hoja de Excel, para la revisión. */
  revision: z
    .array(
      z.object({
        tipo: z.enum(["subcuenta", "cuenta"]),
        nombre: z.string(),
        hoja: z.string(),
        movimientos: z.number().int(),
        saldoExcel: z.number().nullable(),
      }),
    )
    .optional(),
});

function esquemaMovimiento() {
  return z.object({
    fecha: z.iso.date(),
    concepto: z.string().nullable().optional(),
    detalle: z.string().nullable().optional(),
    formaPago: z.string().nullable().optional(),
    referencia: z.string().nullable().optional(),
    nota: z.string().nullable().optional(),
    importe: z.number(),
  });
}

export type Catalogos = z.infer<typeof esquemaCatalogos>;

export type ResultadoImportacion = {
  empresas: number;
  ejecutivos: number;
  clientes: number;
  subcuentas: number;
  cuentas: number;
  usuarios: number;
  movimientos: number;
};

type Db = Pick<NodePgDatabase<typeof s>, "insert" | "select" | "delete" | "update">;

const LOTE = 1500;

/**
 * Carga los catálogos. Se puede repetir: lo que ya existe (mismo nombre o
 * misma dirección de wallet) no se toca. Devuelve cuántos registros son nuevos.
 */
export async function importarCatalogos(tx: Db, datos: Catalogos): Promise<ResultadoImportacion> {
  // Renombrar lo existente solo si el nombre nuevo no está ya en uso.
  for (const r of datos.renombrar ?? []) {
    const tabla = r.tipo === "cliente" ? s.clientes : s.subcuentas;
    const [ocupado] = await tx.select({ id: tabla.id }).from(tabla).where(eq(tabla.nombre, r.a)).limit(1);
    if (!ocupado) await tx.update(tabla).set({ nombre: r.a }).where(eq(tabla.nombre, r.de));
  }

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

  // Usuarios: solo se crean los que no existen; nunca se cambia la contraseña de uno existente.
  let usuarios = 0;
  if (datos.usuarios?.length) {
    const idCliente = new Map(
      (await tx.select({ id: s.clientes.id, nombre: s.clientes.nombre }).from(s.clientes)).map((c) => [c.nombre, c.id]),
    );
    const existentes = new Set(
      (await tx.select({ usuario: s.usuarios.usuario }).from(s.usuarios)).map((u) => u.usuario),
    );
    for (const u of datos.usuarios) {
      if (existentes.has(u.usuario.toLowerCase())) continue; // no se re-encripta: ahorra tiempo
      const creados = await tx
        .insert(s.usuarios)
        .values({
          usuario: u.usuario.toLowerCase(),
          nombre: u.nombre,
          email: u.email?.toLowerCase() ?? null,
          rol: u.rol,
          ejecutivoId: u.ejecutivo ? (idEjecutivo.get(u.ejecutivo) ?? null) : null,
          clienteId: u.cliente ? (idCliente.get(u.cliente) ?? null) : null,
          passwordHash: await bcrypt.hash(u.password, 12),
          debeCambiarPassword: true,
        })
        .onConflictDoNothing()
        .returning({ id: s.usuarios.id });
      usuarios += creados.length;
    }
  }

  // Movimientos: los importados antes desde Excel se sustituyen; los registrados en la web no se tocan.
  let movimientos = 0;
  if (datos.movimientos) {
    const idSubcuenta = new Map(
      (await tx.select({ id: s.subcuentas.id, nombre: s.subcuentas.nombre }).from(s.subcuentas)).map((x) => [x.nombre, x.id]),
    );
    const idCuenta = new Map(
      (await tx.select({ id: s.cuentas.id, nombre: s.cuentas.nombre }).from(s.cuentas)).map((x) => [x.nombre, x.id]),
    );
    const filas: (typeof s.movimientos.$inferInsert)[] = [];
    const destinos = { subcuentas: [] as number[], cuentas: [] as number[] };
    for (const [nombre, lista] of Object.entries(datos.movimientos.subcuentas)) {
      const id = idSubcuenta.get(nombre);
      if (!id) throw new Error(`La subcuenta «${nombre}» no está en el catálogo del archivo.`);
      destinos.subcuentas.push(id);
      for (const m of lista) filas.push(fila(m, { subcuentaId: id }));
    }
    for (const [nombre, lista] of Object.entries(datos.movimientos.cuentas)) {
      const id = idCuenta.get(nombre);
      if (!id) throw new Error(`La cuenta «${nombre}» no está en el catálogo del archivo.`);
      destinos.cuentas.push(id);
      for (const m of lista) filas.push(fila(m, { cuentaId: id }));
    }
    const excel = eq(s.movimientos.origen, "excel");
    if (destinos.subcuentas.length) {
      await tx.delete(s.movimientos).where(and(excel, inArray(s.movimientos.subcuentaId, destinos.subcuentas)));
    }
    if (destinos.cuentas.length) {
      await tx.delete(s.movimientos).where(and(excel, inArray(s.movimientos.cuentaId, destinos.cuentas)));
    }
    for (let i = 0; i < filas.length; i += LOTE) {
      await tx.insert(s.movimientos).values(filas.slice(i, i + LOTE));
    }
    movimientos = filas.length;

    for (const r of datos.revision ?? []) {
      const subcuentaId = r.tipo === "subcuenta" ? (idSubcuenta.get(r.nombre) ?? null) : null;
      const cuentaId = r.tipo === "cuenta" ? (idCuenta.get(r.nombre) ?? null) : null;
      if (!subcuentaId && !cuentaId) continue;
      const valores = {
        subcuentaId,
        cuentaId,
        hoja: r.hoja,
        movimientos: r.movimientos,
        saldo: r.saldoExcel === null ? null : String(r.saldoExcel),
        cargadoEn: new Date(),
      };
      await tx
        .insert(s.referenciasExcel)
        .values(valores)
        .onConflictDoUpdate({
          target: subcuentaId ? s.referenciasExcel.subcuentaId : s.referenciasExcel.cuentaId,
          set: valores,
        });
    }
  }

  return {
    empresas: empresas.length,
    ejecutivos: ejecutivos.length,
    clientes,
    subcuentas,
    cuentas: cuentas.length,
    usuarios,
    movimientos,
  };
}

type MovimientoArchivo = ReturnType<typeof esquemaMovimiento>["_output"];

function fila(
  m: MovimientoArchivo,
  destino: { subcuentaId?: number; cuentaId?: number },
): typeof s.movimientos.$inferInsert {
  return {
    ...destino,
    fecha: m.fecha,
    concepto: m.concepto ?? null,
    detalle: m.detalle ?? null,
    formaPago: m.formaPago ?? null,
    referencia: m.referencia ?? null,
    nota: m.nota ?? null,
    importe: String(m.importe),
    origen: "excel",
  };
}
