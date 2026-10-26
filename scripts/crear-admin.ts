/**
 * Crea (o reactiva) un usuario administrador.
 *   npm run crear-admin -- correo@empresa.com "Nombre" "contraseña"
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { usuarios } from "../src/db/schema";

async function main() {
  const [email, nombre, password] = process.argv.slice(2);
  if (!email || !nombre || !password) {
    console.error('Uso: npm run crear-admin -- correo@empresa.com "Nombre" "contraseña"');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("La contraseña debe tener al menos 10 caracteres.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });
  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .insert(usuarios)
    .values({ email: email.toLowerCase(), nombre, passwordHash, rol: "admin" })
    .onConflictDoUpdate({
      target: usuarios.email,
      set: { nombre, passwordHash, rol: "admin", activo: true },
    });
  console.log(`Administrador listo: ${email.toLowerCase()}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
