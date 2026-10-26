import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioImportacion } from "./formulario";

export const metadata = { title: "Importar" };

export default async function PaginaImportar() {
  await requerirUsuario(["admin"]);
  return (
    <>
      <Encabezado
        titulo="Importar catálogos"
        descripcion="Carga empresas, ejecutivos, clientes con sus subcuentas y cuentas de tesorería desde un archivo. Se puede repetir: lo que ya existe no se duplica ni se modifica."
      />
      <FormularioImportacion />
    </>
  );
}
