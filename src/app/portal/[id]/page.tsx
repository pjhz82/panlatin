import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, subcuentas } from "@/db/schema";
import { DescargarPdf } from "@/components/descargar-pdf";
import { EstadoDeCuenta } from "@/components/estado-cuenta";
import { Encabezado } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { filtroSubcuentas } from "@/lib/alcance";

export const metadata = { title: "Estado de cuenta" };

export default async function PaginaPortalSubcuenta({ params, searchParams }: PageProps<"/portal/[id]">) {
  const usuario = await requerirUsuario(["cliente"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [sub] = await db
    .select({ id: subcuentas.id, nombre: subcuentas.nombre })
    .from(subcuentas)
    .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
    .where(and(eq(subcuentas.id, id), filtroSubcuentas(usuario), eq(subcuentas.activa, true)))
    .limit(1);
  if (!sub) notFound();
  return (
    <>
      <Encabezado
        titulo={sub.nombre}
        descripcion={
          <Link href="/portal" className="underline">
            ← Mis cuentas
          </Link>
        }
      />
      <div className="mb-6">
        <DescargarPdf ruta={`/portal/${sub.id}/pdf`} />
      </div>
      <EstadoDeCuenta destino={{ subcuentaId: sub.id }} moneda="USD" parametros={await searchParams} ruta={`/portal/${sub.id}`} mostrarRevision={false} />
    </>
  );
}
