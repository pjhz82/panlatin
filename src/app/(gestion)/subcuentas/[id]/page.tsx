import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, ejecutivos, subcuentas } from "@/db/schema";
import { EstadoDeCuenta } from "@/components/estado-cuenta";
import { Encabezado, EstadoActivo } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { ejecutivoDeSubcuenta, filtroSubcuentas } from "@/lib/alcance";

export const metadata = { title: "Estado de cuenta" };

export default async function PaginaSubcuenta({ params, searchParams }: PageProps<"/subcuentas/[id]">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [sub] = await db
    .select({
      id: subcuentas.id,
      nombre: subcuentas.nombre,
      activa: subcuentas.activa,
      clienteId: clientes.id,
      cliente: clientes.nombre,
      ejecutivo: ejecutivos.codigo,
    })
    .from(subcuentas)
    .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
    .leftJoin(ejecutivos, eq(ejecutivos.id, ejecutivoDeSubcuenta))
    .where(and(eq(subcuentas.id, id), filtroSubcuentas(usuario)))
    .limit(1);
  if (!sub) notFound();

  return (
    <>
      <Encabezado
        titulo={sub.nombre}
        descripcion={
          <>
            Cliente{" "}
            <Link href={`/clientes/${sub.clienteId}`} className="underline">
              {sub.cliente}
            </Link>{" "}
            · Ejecutivo {sub.ejecutivo ?? "sin asignar"} · <EstadoActivo activo={sub.activa} />
          </>
        }
      />
      <EstadoDeCuenta
        destino={{ subcuentaId: sub.id }}
        moneda="USD"
        parametros={await searchParams}
        ruta={`/subcuentas/${sub.id}`}
      />
    </>
  );
}
