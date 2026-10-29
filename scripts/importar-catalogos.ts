/**
 * Carga inicial de catálogos desde un JSON (en local; en la web publicada se
 * usa la pantalla Importar). Se puede repetir: lo que ya existe no se toca.
 *
 *   npm run importar-catalogos -- datos/catalogos-tesoreria.json
 *
 * El JSON tiene datos reales de la empresa: guárdalo en datos/ (ignorado por git).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";
import { esquemaCatalogos, importarCatalogos } from "../src/lib/catalogos";

async function main() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error("Uso: npm run importar-catalogos -- datos/catalogos-tesoreria.json");
    process.exit(1);
  }
  const datos = esquemaCatalogos.parse(JSON.parse(readFileSync(ruta, "utf8")));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema: s });
  const [admin] = await db.select({ id: s.usuarios.id }).from(s.usuarios).where(eq(s.usuarios.rol, "admin")).limit(1);
  if (!admin) throw new Error("Crea antes un administrador (npm run crear-admin).");
  const r = await db.transaction((tx) => importarCatalogos(tx, datos, admin.id));
  console.log(
    `Nuevos → empresas: ${r.empresas} · ejecutivos: ${r.ejecutivos} · clientes: ${r.clientes} · ` +
      `subcuentas: ${r.subcuentas} · cuentas: ${r.cuentas} · operaciones históricas: ${r.operaciones}`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
