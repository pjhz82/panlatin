import Link from "next/link";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientes, ejecutivos, subcuentas } from "@/db/schema";
import {
  Boton,
  BotonEnlace,
  Encabezado,
  EstadoActivo,
  Entrada,
  FilaVacia,
  Selector,
  Tabla,
  Td,
  Th,
} from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { filtroClientes, puedeEditarClientes } from "@/lib/alcance";

export const metadata = { title: "Clientes" };

export default async function PaginaClientes({ searchParams }: PageProps<"/clientes">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const parametros = await searchParams;
  const q = typeof parametros.q === "string" ? parametros.q.trim() : "";
  const ejecutivoId = Number(parametros.ejecutivo) || undefined;

  const [filas, listaEjecutivos] = await Promise.all([
    db
      .select({
        id: clientes.id,
        nombre: clientes.nombre,
        activo: clientes.activo,
        ejecutivo: ejecutivos.codigo,
        subcuentas: sql<number>`(select count(*) from subcuentas s where s.cliente_id = clientes.id)`.mapWith(Number),
      })
      .from(clientes)
      .leftJoin(ejecutivos, eq(ejecutivos.id, clientes.ejecutivoId))
      .leftJoin(subcuentas, eq(subcuentas.clienteId, clientes.id))
      .where(
        and(
          filtroClientes(usuario),
          q ? or(ilike(clientes.nombre, `%${q}%`), ilike(subcuentas.nombre, `%${q}%`)) : undefined,
          ejecutivoId ? eq(clientes.ejecutivoId, ejecutivoId) : undefined,
        ),
      )
      .groupBy(clientes.id, ejecutivos.codigo)
      .orderBy(asc(clientes.nombre)),
    usuario.rol === "ejecutivo"
      ? Promise.resolve([])
      : db.select().from(ejecutivos).orderBy(asc(ejecutivos.codigo)),
  ]);

  return (
    <>
      <Encabezado
        titulo={usuario.rol === "ejecutivo" ? "Mis clientes" : "Clientes"}
        descripcion={`${filas.length} cliente${filas.length === 1 ? "" : "s"}`}
        acciones={
          puedeEditarClientes(usuario) && <BotonEnlace href="/clientes/nuevo">Nuevo cliente</BotonEnlace>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <Entrada name="q" defaultValue={q} placeholder="Buscar cliente o subcuenta…" className="max-w-xs" />
        {listaEjecutivos.length > 0 && (
          <Selector name="ejecutivo" defaultValue={ejecutivoId ?? ""} className="max-w-48">
            <option value="">Todos los ejecutivos</option>
            {listaEjecutivos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo}
              </option>
            ))}
          </Selector>
        )}
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
      </form>
      <Tabla>
        <thead>
          <tr>
            <Th>Cliente</Th>
            <Th>Ejecutivo</Th>
            <Th className="text-right">Subcuentas</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia columnas={4} texto="No hay clientes que coincidan." />}
          {filas.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                  {c.nombre}
                </Link>
              </Td>
              <Td>{c.ejecutivo ?? "—"}</Td>
              <Td className="text-right tabular-nums">{c.subcuentas}</Td>
              <Td>
                <EstadoActivo activo={c.activo} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
