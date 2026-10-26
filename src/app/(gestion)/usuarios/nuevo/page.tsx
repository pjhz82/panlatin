import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioUsuario } from "../formulario";
import { opcionesUsuario } from "../opciones";

export const metadata = { title: "Nuevo usuario" };

export default async function PaginaNuevoUsuario() {
  await requerirUsuario(["admin"]);
  const [ejecutivos, clientes] = await opcionesUsuario();
  return (
    <>
      <Encabezado titulo="Nuevo usuario" />
      <FormularioUsuario ejecutivos={ejecutivos} clientes={clientes} />
    </>
  );
}
