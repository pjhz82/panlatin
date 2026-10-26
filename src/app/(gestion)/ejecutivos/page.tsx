import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { ejecutivos } from "@/db/schema";
import { BotonEnlace, Encabezado, EstadoActivo, FilaVacia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";

export const metadata = { title: "Ejecutivos" };

export default async function PaginaEjecutivos() {
  await requerirUsuario(["admin"]);
  const filas = await db
    .select({
      id: ejecutivos.id,
      codigo: ejecutivos.codigo,
      nombre: ejecutivos.nombre,
      activo: ejecutivos.activo,
      // Drizzle no califica las columnas en un select de una sola tabla: SQL explícito.
      subcuentas: sql<number>`(
        select count(*) from subcuentas s
        join clientes c on c.id = s.cliente_id
        where coalesce(s.ejecutivo_id, c.ejecutivo_id) = ejecutivos.id
      )`.mapWith(Number),
      usuarios: sql<number>`(select count(*) from usuarios u where u.ejecutivo_id = ejecutivos.id)`.mapWith(
        Number,
      ),
    })
    .from(ejecutivos)
    .orderBy(asc(ejecutivos.codigo));

  return (
    <>
      <Encabezado
        titulo="Ejecutivos"
        descripcion="Socios que traen clientes. Cada pedido necesita la firma de dos ejecutivos."
        acciones={<BotonEnlace href="/ejecutivos/nuevo">Nuevo ejecutivo</BotonEnlace>}
      />
      <Tabla>
        <thead>
          <tr>
            <Th>Código</Th>
            <Th>Nombre</Th>
            <Th className="text-right">Subcuentas</Th>
            <Th className="text-right">Usuarios</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia columnas={5} texto="Todavía no hay ejecutivos." />}
          {filas.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/ejecutivos/${e.id}`} className="font-medium hover:underline">
                  {e.codigo}
                </Link>
              </Td>
              <Td>{e.nombre}</Td>
              <Td className="text-right tabular-nums">{e.subcuentas}</Td>
              <Td className="text-right tabular-nums">{e.usuarios}</Td>
              <Td>
                <EstadoActivo activo={e.activo} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
