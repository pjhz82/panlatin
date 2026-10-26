import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cuentas, empresas } from "@/db/schema";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { FormularioCuenta } from "../formulario";

export const metadata = { title: "Editar cuenta" };

export default async function PaginaEditarCuenta({ params }: PageProps<"/cuentas/[id]">) {
  await requerirUsuario(["admin"]);
  const id = Number((await params).id);
  const [cuenta] = Number.isInteger(id)
    ? await db.select().from(cuentas).where(eq(cuentas.id, id)).limit(1)
    : [];
  if (!cuenta) notFound();
  const lista = await db
    .select({ id: empresas.id, nombre: empresas.nombre })
    .from(empresas)
    .orderBy(asc(empresas.nombre));
  return (
    <>
      <Encabezado titulo={cuenta.nombre} descripcion="Editar cuenta" />
      <FormularioCuenta cuenta={cuenta} empresas={lista} />
    </>
  );
}
