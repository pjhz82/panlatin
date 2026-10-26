/**
 * Carga inicial de catálogos (empresas, ejecutivos, clientes con subcuentas y
 * cuentas de tesorería) desde un JSON. Se puede repetir: lo que ya existe
 * (mismo nombre o misma dirección de wallet) no se toca.
 *
 *   npm run importar-catalogos -- datos/catalogos.json
 *
 * El JSON tiene datos reales de la empresa: guárdalo en datos/ (ignorado por git).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";

type Catalogos = {
  empresas: string[];
  ejecutivos: string[];
  clientes: {
    nombre: string;
    ejecutivo: string | null;
    subcuentas: { nombre: string; ejecutivo: string | null }[];
  }[];
  cuentas: {
    nombre: string;
    tipo: s.TipoCuenta;
    moneda: s.Moneda;
    empresa?: string;
    entidad?: string;
    red?: s.Red;
    direccion?: string;
  }[];
};

async function main() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error("Uso: npm run importar-catalogos -- datos/catalogos.json");
    process.exit(1);
  }
  const datos: Catalogos = JSON.parse(readFileSync(ruta, "utf8"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: s });

  await db.transaction(async (tx) => {
    await tx
      .insert(s.empresas)
      .values(datos.empresas.map((nombre) => ({ nombre })))
      .onConflictDoNothing();
    await tx
      .insert(s.ejecutivos)
      .values(datos.ejecutivos.map((codigo) => ({ codigo, nombre: codigo })))
      .onConflictDoNothing();

    const idEmpresa = new Map((await tx.select().from(s.empresas)).map((e) => [e.nombre, e.id]));
    const idEjecutivo = new Map((await tx.select().from(s.ejecutivos)).map((e) => [e.codigo, e.id]));
    const ejecutivo = (codigo: string | null) => (codigo ? (idEjecutivo.get(codigo) ?? null) : null);

    let nuevosClientes = 0;
    let nuevasSubcuentas = 0;
    for (const c of datos.clientes) {
      const [creado] = await tx
        .insert(s.clientes)
        .values({ nombre: c.nombre, ejecutivoId: ejecutivo(c.ejecutivo) })
        .onConflictDoNothing()
        .returning({ id: s.clientes.id });
      if (creado) nuevosClientes++;
      const clienteId =
        creado?.id ??
        (await tx.select({ id: s.clientes.id }).from(s.clientes).where(eq(s.clientes.nombre, c.nombre)))[0].id;
      const insertadas = await tx
        .insert(s.subcuentas)
        .values(c.subcuentas.map((sc) => ({ clienteId, nombre: sc.nombre, ejecutivoId: ejecutivo(sc.ejecutivo) })))
        .onConflictDoNothing()
        .returning({ id: s.subcuentas.id });
      nuevasSubcuentas += insertadas.length;
    }

    const cuentas = await tx
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
      .returning({ id: s.cuentas.id });

    console.log(
      `Empresas: ${idEmpresa.size} · Ejecutivos: ${idEjecutivo.size} · ` +
        `Clientes nuevos: ${nuevosClientes} · Subcuentas nuevas: ${nuevasSubcuentas} · ` +
        `Cuentas nuevas: ${cuentas.length}`,
    );
  });
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
