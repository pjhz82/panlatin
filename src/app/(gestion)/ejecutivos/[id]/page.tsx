import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ejecutivos } from "@/db/schema";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioEjecutivo } from "../formulario";

export const metadata = { title: "Editar ejecutivo" };

export default async function PaginaEditarEjecutivo({ params }: PageProps<"/ejecutivos/[id]">) {
  await requerirUsuario(["admin"]);
  const id = Number((await params).id);
  const [ejecutivo] = Number.isInteger(id)
    ? await db.select().from(ejecutivos).where(eq(ejecutivos.id, id)).limit(1)
    : [];
  if (!ejecutivo) notFound();
  return (
    <>
      <Encabezado titulo={ejecutivo.codigo} descripcion={ejecutivo.nombre} />
      <FormularioEjecutivo ejecutivo={ejecutivo} />
    </>
  );
}
