import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioUsuario } from "../formulario";
import { opcionesUsuario } from "../opciones";

export const metadata = { title: "Editar usuario" };

export default async function PaginaEditarUsuario({ params }: PageProps<"/usuarios/[id]">) {
  await requerirUsuario(["admin"]);
  const id = Number((await params).id);
  const [usuario] = Number.isInteger(id)
    ? await db
        .select({
          id: usuarios.id,
          nombre: usuarios.nombre,
          usuario: usuarios.usuario,
          email: usuarios.email,
          rol: usuarios.rol,
          ejecutivoId: usuarios.ejecutivoId,
          clienteId: usuarios.clienteId,
          activo: usuarios.activo,
        })
        .from(usuarios)
        .where(eq(usuarios.id, id))
        .limit(1)
    : [];
  if (!usuario) notFound();
  const [ejecutivos, clientes] = await opcionesUsuario();
  return (
    <>
      <Encabezado titulo={usuario.nombre} descripcion={usuario.email ? `${usuario.usuario} · ${usuario.email}` : usuario.usuario} />
      <FormularioUsuario usuario={usuario} ejecutivos={ejecutivos} clientes={clientes} />
    </>
  );
}
