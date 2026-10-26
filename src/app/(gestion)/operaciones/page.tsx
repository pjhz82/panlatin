import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { firmas, operaciones, subcuentas, usuarios, type EstadoOperacion } from "@/db/schema";
import { BotonEnlace, Encabezado, FilaVacia, Insignia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { ESTADOS_OPERACION, FIRMAS_REQUERIDAS, TIPOS_OPERACION } from "@/lib/operaciones";

export const metadata = { title: "Operaciones" };

const VISTAS: Record<string, { nombre: string; estados: EstadoOperacion[] | null }> = {
  firmar: { nombre: "Pendientes de firma", estados: ["pendiente_firmas"] },
  ejecutar: { nombre: "Por ejecutar", estados: ["aprobada", "en_ejecucion"] },
  completadas: { nombre: "Completadas", estados: ["completada"] },
  cerradas: { nombre: "Rechazadas y anuladas", estados: ["rechazada", "anulada"] },
  todas: { nombre: "Todas", estados: null },
};

export default async function PaginaOperaciones({ searchParams }: PageProps<"/operaciones">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const vista = String((await searchParams).ver ?? "firmar");
  const actual = VISTAS[vista] ?? VISTAS.firmar;
  const autor = alias(usuarios, "autor");

  const [filas, conteos] = await Promise.all([
    db
      .select({
        id: operaciones.id,
        fecha: operaciones.fecha,
        tipo: operaciones.tipo,
        estado: operaciones.estado,
        montoUsd: operaciones.montoUsd,
        tasa: operaciones.tasa,
        subcuentaId: operaciones.subcuentaId,
        subcuenta: subcuentas.nombre,
        autor: autor.nombre,
        aprobaciones: sql<number>`(select count(*) from ${firmas} where ${firmas.operacionId} = ${operaciones.id} and ${firmas.aprueba})`.mapWith(Number),
      })
      .from(operaciones)
      .leftJoin(subcuentas, eq(subcuentas.id, operaciones.subcuentaId))
      .innerJoin(autor, eq(autor.id, operaciones.creadoPor))
      .where(actual.estados ? inArray(operaciones.estado, actual.estados) : undefined)
      .orderBy(desc(operaciones.fecha), desc(operaciones.id))
      .limit(300),
    db.select({ estado: operaciones.estado, n: sql<number>`count(*)`.mapWith(Number) }).from(operaciones).groupBy(operaciones.estado),
  ]);
  const n = (estados: EstadoOperacion[] | null) =>
    conteos.filter((c) => !estados || estados.includes(c.estado)).reduce((t, c) => t + c.n, 0);

  return (
    <>
      <Encabezado
        titulo="Operaciones"
        descripcion="Cada operación necesita la firma de dos ejecutivos antes de ejecutarse."
        acciones={usuario.rol !== "ejecutivo" && <BotonEnlace href="/operaciones/nueva">Nueva operación</BotonEnlace>}
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {Object.entries(VISTAS).map(([clave, v]) => (
          <Link
            key={clave}
            href={`/operaciones?ver=${clave}`}
            className={`rounded-full px-3 py-1.5 ${clave === vista || (!VISTAS[vista] && clave === "firmar") ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {v.nombre} <span className="tabular-nums opacity-70">{n(v.estados)}</span>
          </Link>
        ))}
      </div>
      <Tabla>
        <thead>
          <tr>
            <Th>Op.</Th>
            <Th>Fecha</Th>
            <Th>Tipo</Th>
            <Th>Cliente</Th>
            <Th className="text-right">Monto US$</Th>
            <Th className="text-right">Tasa</Th>
            <Th>Estado</Th>
            <Th>Creada por</Th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia columnas={8} texto="No hay operaciones en esta vista." />}
          {filas.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/operaciones/${o.id}`} className="font-medium hover:underline">
                  #{o.id}
                </Link>
              </Td>
              <Td className="whitespace-nowrap">{fechaCorta(o.fecha)}</Td>
              <Td>{TIPOS_OPERACION[o.tipo].nombre}</Td>
              <Td>{o.subcuenta ?? "—"}</Td>
              <Td className="text-right tabular-nums">{o.montoUsd ? importe(o.montoUsd) : "—"}</Td>
              <Td className="text-right tabular-nums">{o.tasa ? importe(o.tasa) : "—"}</Td>
              <Td>
                <Insignia color={ESTADOS_OPERACION[o.estado].color}>{ESTADOS_OPERACION[o.estado].nombre}</Insignia>
                {o.estado === "pendiente_firmas" && (
                  <span className="ml-1 text-xs text-slate-500">
                    {o.aprobaciones}/{FIRMAS_REQUERIDAS}
                  </span>
                )}
              </Td>
              <Td className="text-slate-600">{o.autor}</Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
