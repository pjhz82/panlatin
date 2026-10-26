import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { empresas } from "@/db/schema";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioEmpresa } from "../formulario";

export const metadata = { title: "Editar empresa" };

export default async function PaginaEditarEmpresa({ params }: PageProps<"/empresas/[id]">) {
  await requerirUsuario(["admin"]);
  const id = Number((await params).id);
  const [empresa] = Number.isInteger(id)
    ? await db.select().from(empresas).where(eq(empresas.id, id)).limit(1)
    : [];
  if (!empresa) notFound();
  return (
    <>
      <Encabezado titulo={empresa.nombre} descripcion="Editar empresa" />
      <FormularioEmpresa empresa={empresa} />
    </>
  );
}
