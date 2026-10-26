/**
 * Crea (o reactiva) un usuario administrador.
 *   npm run crear-admin -- usuario "Nombre" "contraseña" [correo]
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { usuarios } from "../src/db/schema";

async function main() {
  const [usuarioArg, nombre, password, emailArg] = process.argv.slice(2);
  if (!usuarioArg || !nombre || !password) {
    console.error('Uso: npm run crear-admin -- usuario "Nombre" "contraseña" [correo]');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("La contraseña debe tener al menos 10 caracteres.");
    process.exit(1);
  }
  const usuario = usuarioArg.toLowerCase();
  const email = emailArg?.toLowerCase() ?? null;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });
  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .insert(usuarios)
    .values({ usuario, email, nombre, passwordHash, rol: "admin" })
    .onConflictDoUpdate({
      target: usuarios.usuario,
      set: { nombre, email, passwordHash, rol: "admin", activo: true },
    });
  console.log(`Administrador listo: ${usuario}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
