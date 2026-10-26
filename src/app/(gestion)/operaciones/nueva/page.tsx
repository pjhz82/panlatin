import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cuentas, subcuentas } from "@/db/schema";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioOperacion } from "./formulario";

export const metadata = { title: "Nueva operación" };

export default async function PaginaNuevaOperacion({ searchParams }: PageProps<"/operaciones/nueva">) {
  await requerirUsuario(["admin", "operadora"]);
  const [listaCuentas, listaSubcuentas] = await Promise.all([
    db
      .select({ id: cuentas.id, nombre: cuentas.nombre, moneda: cuentas.moneda })
      .from(cuentas)
      .where(eq(cuentas.activa, true))
      .orderBy(asc(cuentas.nombre)),
    db.select({ nombre: subcuentas.nombre }).from(subcuentas).where(eq(subcuentas.activa, true)).orderBy(asc(subcuentas.nombre)),
  ]);
  return (
    <>
      <Encabezado titulo="Nueva operación" descripcion="Las partidas se calculan solas a partir de los datos; puedes ajustarlas." />
      <FormularioOperacion
        cuentas={listaCuentas}
        subcuentas={listaSubcuentas.map((s) => s.nombre)}
        hoy={new Date().toISOString().slice(0, 10)}
        subcuentaInicial={typeof (await searchParams).subcuenta === "string" ? String((await searchParams).subcuenta) : ""}
      />
    </>
  );
}
