import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioEmpresa } from "../formulario";

export const metadata = { title: "Nueva empresa" };

export default async function PaginaNuevaEmpresa() {
  await requerirUsuario(["admin"]);
  return (
    <>
      <Encabezado titulo="Nueva empresa" />
      <FormularioEmpresa />
    </>
  );
}
