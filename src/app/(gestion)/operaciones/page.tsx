import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { operaciones, type EstadoOperacion } from "@/db/schema";
import { BarraAvance } from "@/components/avance";
import { BotonEnlace, Encabezado, FilaVacia, Insignia, Tabla, Td, Th } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { ABIERTAS, operacionesConAvance } from "@/lib/flujo";
import { ESTADOS_OPERACION, TIPOS_OPERACION } from "@/lib/operaciones";

export const metadata = { title: "Instrucciones" };

const VISTAS: Record<string, { nombre: string; estados: EstadoOperacion[] | null }> = {
  abiertas: { nombre: "Abiertas", estados: ABIERTAS },
  firmar: { nombre: "Por aprobar", estados: ["pendiente_firmas"] },
  completadas: { nombre: "Completadas", estados: ["completada"] },
  cerradas: { nombre: "Rechazadas y anuladas", estados: ["rechazada", "anulada"] },
  todas: { nombre: "Todas", estados: null },
};

export default async function PaginaOperaciones({ searchParams }: PageProps<"/operaciones">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const sp = await searchParams;
  const vista = VISTAS[String(sp.ver)] ? String(sp.ver) : "abiertas";
  const actual = VISTAS[vista];
  const mias = sp.mias === "1" && Boolean(usuario.ejecutivoId);

  const [todas, conteos] = await Promise.all([
    operacionesConAvance(actual.estados),
    db
      .select({ estado: operaciones.estado, n: sql<number>`count(*)`.mapWith(Number) })
      .from(operaciones)
      .where(eq(operaciones.origen, "web"))
      .groupBy(operaciones.estado),
  ]);
  const filas = mias ? todas.filter((o) => o.ejecutivoId === usuario.ejecutivoId) : todas;
  const n = (estados: EstadoOperacion[] | null) => conteos.filter((c) => !estados || estados.includes(c.estado)).reduce((t, c) => t + c.n, 0);
  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams({ ver: vista, ...(mias ? { mias: "1" } : {}) });
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/operaciones?${p}`;
  };

  return (
    <>
      <Encabezado
        titulo="Instrucciones"
        descripcion="Módulo 1 · Los ejecutivos cierran las operaciones y dan las instrucciones de pago. Aquí se ve cómo va cada una."
        acciones={
          <>
            <BotonEnlace href="/operaciones/panel" variante="secundario">
              Panel diario
            </BotonEnlace>
            <BotonEnlace href="/operaciones/nueva">Nueva instrucción</BotonEnlace>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {Object.entries(VISTAS).map(([clave, v]) => (
          <Link
            key={clave}
            href={enlace({ ver: clave })}
            className={`rounded-full px-3 py-1.5 ${clave === vista ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {v.nombre} <span className="tabular-nums opacity-70">{n(v.estados)}</span>
          </Link>
        ))}
        {usuario.ejecutivoId && (
          <Link href={enlace({ mias: mias ? null : "1" })} className="ml-auto text-sm text-slate-600 underline">
            {mias ? "Ver todas" : "Solo mis clientes"}
          </Link>
        )}
      </div>
      <Tabla>
        <thead>
          <tr>
            <Th>Op.</Th>
            <Th>Fecha</Th>
            <Th>Cliente</Th>
            <Th>Ejec.</Th>
            <Th>Tipo</Th>
            <Th className="text-right">Monto US$</Th>
            <Th>Pagado</Th>
            <Th>En balance</Th>
            <Th>Esperando a</Th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia columnas={9} texto="No hay operaciones en esta vista." />}
          {filas.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/operaciones/${o.id}`} className="font-medium hover:underline">
                  #{o.id}
                </Link>
              </Td>
              <Td className="whitespace-nowrap">{fechaCorta(o.fecha)}</Td>
              <Td>{o.cliente ?? <span className="text-slate-500">{o.descripcion ?? "—"}</span>}</Td>
              <Td className="text-slate-600">{o.ejecutivo ?? "—"}</Td>
              <Td>{TIPOS_OPERACION[o.tipo].nombre}</Td>
              <Td className="text-right tabular-nums">{o.montoUsd ? importe(o.montoUsd) : "—"}</Td>
              <Td>
                <BarraAvance pct={o.pctPagado} />
              </Td>
              <Td>{o.partidas.some((p) => p.avance.ladoCliente) ? <BarraAvance pct={o.pctBalance} /> : <span className="text-xs text-slate-400">—</span>}</Td>
              <Td>
                {o.estado === "completada" || o.estado === "anulada" || o.estado === "rechazada" ? (
                  <Insignia color={ESTADOS_OPERACION[o.estado].color}>{ESTADOS_OPERACION[o.estado].nombre}</Insignia>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {o.esperando.map((e) => (
                      <Insignia key={e} color={e.startsWith("Aprobación") ? "ambar" : "azul"}>
                        {e}
                      </Insignia>
                    ))}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
