import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  // Netlify aplica en cada publicación las migraciones de esta carpeta.
  out: "netlify/database/migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
