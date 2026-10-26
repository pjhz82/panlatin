import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ejecutivos } from "@/db/schema";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioCliente } from "../formularios";

export const metadata = { title: "Nuevo cliente" };

export default async function PaginaNuevoCliente() {
  await requerirUsuario(["admin", "operadora"]);
  const lista = await db
    .select({ id: ejecutivos.id, codigo: ejecutivos.codigo, nombre: ejecutivos.nombre })
    .from(ejecutivos)
    .where(eq(ejecutivos.activo, true))
    .orderBy(asc(ejecutivos.codigo));
  return (
    <>
      <Encabezado titulo="Nuevo cliente" />
      <FormularioCliente ejecutivos={lista} />
    </>
  );
}
