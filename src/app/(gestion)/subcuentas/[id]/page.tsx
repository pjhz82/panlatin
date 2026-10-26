import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, ejecutivos, subcuentas } from "@/db/schema";
import { DescargarPdf } from "@/components/descargar-pdf";
import { EstadoDeCuenta } from "@/components/estado-cuenta";
import { BotonEnlace, Encabezado, EstadoActivo } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { ejecutivoDeSubcuenta, filtroSubcuentas } from "@/lib/alcance";
import { HojaCliente } from "./hoja";
import { OperacionesCliente } from "./operaciones-cliente";

export const metadata = { title: "Hoja del cliente" };

const VISTAS = {
  hoja: "Hoja (como el Excel)",
  panel: "Panel y gráficos",
  operaciones: "Operaciones",
} as const;
type Vista = keyof typeof VISTAS;

export default async function PaginaSubcuenta({
  params,
  searchParams,
}: PageProps<"/subcuentas/[id]">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const parametros = await searchParams;
  const vista: Vista = (Object.keys(VISTAS) as Vista[]).includes(
    parametros.vista as Vista,
  )
    ? (parametros.vista as Vista)
    : "hoja";

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
  const editable = usuario.rol === "admin" || usuario.rol === "operadora";

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
            · Ejecutivo {sub.ejecutivo ?? "sin asignar"} ·{" "}
            <EstadoActivo activo={sub.activa} />
          </>
        }
        acciones={
          editable && (
            <BotonEnlace
              href={`/operaciones/nueva?subcuenta=${encodeURIComponent(sub.nombre)}`}
            >
              Nueva operación completa
            </BotonEnlace>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(Object.entries(VISTAS) as [Vista, string][]).map(
            ([clave, nombre]) => (
              <Link
                key={clave}
                href={
                  clave === "hoja"
                    ? `/subcuentas/${sub.id}`
                    : `/subcuentas/${sub.id}?vista=${clave}`
                }
                className={`rounded-full px-3 py-1.5 ${clave === vista ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {nombre}
              </Link>
            ),
          )}
        </div>
        <DescargarPdf ruta={`/subcuentas/${sub.id}/pdf`} />
      </div>
      {vista === "hoja" && (
        <HojaCliente
          subcuentaId={sub.id}
          nombre={sub.nombre}
          editable={editable}
        />
      )}
      {vista === "panel" && (
        <EstadoDeCuenta
          destino={{ subcuentaId: sub.id }}
          moneda="USD"
          parametros={parametros}
          ruta={`/subcuentas/${sub.id}?vista=panel`}
        />
      )}
      {vista === "operaciones" && <OperacionesCliente subcuentaId={sub.id} />}
    </>
  );
}
