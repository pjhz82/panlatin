import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, cuentas, subcuentas } from "@/db/schema";
import { filtroSubcuentas } from "@/lib/alcance";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioOperacion } from "./formulario";

export const metadata = { title: "Nueva instrucción" };

export default async function PaginaNuevaOperacion({ searchParams }: PageProps<"/operaciones/nueva">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const [listaCuentas, listaSubcuentas] = await Promise.all([
    db
      .select({ id: cuentas.id, nombre: cuentas.nombre, moneda: cuentas.moneda, entidad: cuentas.entidad })
      .from(cuentas)
      .where(eq(cuentas.activa, true))
      .orderBy(asc(cuentas.nombre)),
    db
      .select({ nombre: subcuentas.nombre })
      .from(subcuentas)
      .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
      .where(and(eq(subcuentas.activa, true), filtroSubcuentas(usuario)))
      .orderBy(asc(subcuentas.nombre)),
  ]);
  return (
    <>
      <Encabezado titulo="Nueva instrucción" descripcion="Cierra la operación y da las instrucciones de pago. Las partidas se calculan solas; puedes ajustarlas." />
      <FormularioOperacion
        cuentas={listaCuentas}
        subcuentas={listaSubcuentas.map((s) => s.nombre)}
        hoy={new Date().toISOString().slice(0, 10)}
        esEjecutivo={Boolean(usuario.ejecutivoId)}
        subcuentaInicial={typeof (await searchParams).subcuenta === "string" ? String((await searchParams).subcuenta) : ""}
      />
    </>
  );
}
