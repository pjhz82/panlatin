import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioEjecutivo } from "../formulario";

export const metadata = { title: "Nuevo ejecutivo" };

export default async function PaginaNuevoEjecutivo() {
  await requerirUsuario(["admin"]);
  return (
    <>
      <Encabezado titulo="Nuevo ejecutivo" />
      <FormularioEjecutivo />
    </>
  );
}
