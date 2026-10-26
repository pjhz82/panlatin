import { asc } from "drizzle-orm";
import { db } from "@/db";
import { empresas } from "@/db/schema";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioCuenta } from "../formulario";

export const metadata = { title: "Nueva cuenta" };

export default async function PaginaNuevaCuenta() {
  await requerirUsuario(["admin"]);
  const lista = await db
    .select({ id: empresas.id, nombre: empresas.nombre })
    .from(empresas)
    .orderBy(asc(empresas.nombre));
  return (
    <>
      <Encabezado titulo="Nueva cuenta" />
      <FormularioCuenta empresas={lista} />
    </>
  );
}
