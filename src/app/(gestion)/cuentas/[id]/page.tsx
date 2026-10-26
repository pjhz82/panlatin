import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cuentas, empresas } from "@/db/schema";
import { EstadoDeCuenta } from "@/components/estado-cuenta";
import { BotonEnlace, Encabezado, EstadoActivo } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { MONEDAS, REDES, TIPOS_CUENTA, urlExplorador } from "@/lib/etiquetas";

export const metadata = { title: "Cuenta" };

export default async function PaginaCuenta({ params, searchParams }: PageProps<"/cuentas/[id]">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [cuenta] = await db
    .select({
      id: cuentas.id,
      nombre: cuentas.nombre,
      tipo: cuentas.tipo,
      moneda: cuentas.moneda,
      entidad: cuentas.entidad,
      red: cuentas.red,
      direccion: cuentas.direccion,
      activa: cuentas.activa,
      empresa: empresas.nombre,
    })
    .from(cuentas)
    .leftJoin(empresas, eq(empresas.id, cuentas.empresaId))
    .where(eq(cuentas.id, id))
    .limit(1);
  if (!cuenta) notFound();

  return (
    <>
      <Encabezado
        titulo={cuenta.nombre}
        descripcion={
          <>
            {TIPOS_CUENTA[cuenta.tipo]} · {MONEDAS[cuenta.moneda]}
            {cuenta.empresa && ` · ${cuenta.empresa}`}
            {cuenta.entidad && ` · ${cuenta.entidad}`}
            {cuenta.red && cuenta.direccion && (
              <>
                {" · "}
                <a href={urlExplorador(cuenta.red, cuenta.direccion)} target="_blank" rel="noreferrer" className="underline">
                  {REDES[cuenta.red]}
                </a>
              </>
            )}{" "}
            · <EstadoActivo activo={cuenta.activa} />
          </>
        }
        acciones={
          usuario.rol === "admin" && (
            <BotonEnlace href={`/cuentas/${cuenta.id}/editar`} variante="secundario">
              Editar
            </BotonEnlace>
          )
        }
      />
      <EstadoDeCuenta
        destino={{ cuentaId: cuenta.id }}
        moneda={cuenta.moneda}
        parametros={await searchParams}
        ruta={`/cuentas/${cuenta.id}`}
      />
    </>
  );
}
