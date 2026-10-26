import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { cuentas, empresas } from "@/db/schema";
import { BotonEnlace, Encabezado, EstadoActivo, FilaVacia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";

export const metadata = { title: "Empresas" };

export default async function PaginaEmpresas() {
  await requerirUsuario(["admin"]);
  const filas = await db
    .select({
      id: empresas.id,
      nombre: empresas.nombre,
      pais: empresas.pais,
      activa: empresas.activa,
      cuentas: count(cuentas.id),
    })
    .from(empresas)
    .leftJoin(cuentas, eq(cuentas.empresaId, empresas.id))
    .groupBy(empresas.id)
    .orderBy(asc(empresas.nombre));

  return (
    <>
      <Encabezado
        titulo="Empresas"
        descripcion="Empresas del holding. Cada una lleva su contabilidad, pero aquí se ven juntas."
        acciones={<BotonEnlace href="/empresas/nueva">Nueva empresa</BotonEnlace>}
      />
      <Tabla>
        <thead>
          <tr>
            <Th>Nombre</Th>
            <Th>País</Th>
            <Th className="text-right">Cuentas</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia columnas={4} texto="Todavía no hay empresas." />}
          {filas.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/empresas/${e.id}`} className="font-medium hover:underline">
                  {e.nombre}
                </Link>
              </Td>
              <Td>{e.pais ?? "—"}</Td>
              <Td className="text-right tabular-nums">{e.cuentas}</Td>
              <Td>
                <EstadoActivo activo={e.activa} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
