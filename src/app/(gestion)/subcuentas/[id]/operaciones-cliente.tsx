import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { firmas, operaciones } from "@/db/schema";
import { FilaVacia, Insignia, Tabla, Td, Th } from "@/components/ui";
import { fechaCorta, importe } from "@/lib/dinero";
import { ESTADOS_OPERACION, FIRMAS_REQUERIDAS, TIPOS_OPERACION } from "@/lib/operaciones";

export async function OperacionesCliente({ subcuentaId }: { subcuentaId: number }) {
  const filas = await db
    .select({
      id: operaciones.id,
      fecha: operaciones.fecha,
      tipo: operaciones.tipo,
      estado: operaciones.estado,
      montoUsd: operaciones.montoUsd,
      tasa: operaciones.tasa,
      utilidad: operaciones.utilidad,
      descripcion: operaciones.descripcion,
      aprobaciones: sql<number>`(select count(*) from ${firmas} where ${firmas.operacionId} = ${operaciones.id} and ${firmas.aprueba})`.mapWith(Number),
    })
    .from(operaciones)
    .where(eq(operaciones.subcuentaId, subcuentaId))
    .orderBy(desc(operaciones.fecha), desc(operaciones.id));
  return (
    <Tabla>
      <thead>
        <tr>
          <Th>Op.</Th>
          <Th>Fecha</Th>
          <Th>Tipo</Th>
          <Th>Descripción</Th>
          <Th className="text-right">Monto US$</Th>
          <Th className="text-right">Tasa</Th>
          <Th className="text-right">Utilidad</Th>
          <Th>Estado</Th>
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && <FilaVacia columnas={8} texto="Este cliente no tiene operaciones registradas en la web todavía." />}
        {filas.map((o) => (
          <tr key={o.id} className="hover:bg-slate-50">
            <Td>
              <Link href={`/operaciones/${o.id}`} className="font-medium hover:underline">
                #{o.id}
              </Link>
            </Td>
            <Td className="whitespace-nowrap">{fechaCorta(o.fecha)}</Td>
            <Td>{TIPOS_OPERACION[o.tipo].nombre}</Td>
            <Td className="max-w-xs truncate text-slate-600">{o.descripcion ?? "—"}</Td>
            <Td className="text-right tabular-nums">{o.montoUsd ? importe(o.montoUsd) : "—"}</Td>
            <Td className="text-right tabular-nums">{o.tasa ? importe(o.tasa) : "—"}</Td>
            <Td className="text-right tabular-nums">{o.utilidad ? importe(o.utilidad) : "—"}</Td>
            <Td>
              <Insignia color={ESTADOS_OPERACION[o.estado].color}>{ESTADOS_OPERACION[o.estado].nombre}</Insignia>
              {o.estado === "pendiente_firmas" && <span className="ml-1 text-xs text-slate-500">{o.aprobaciones}/{FIRMAS_REQUERIDAS}</span>}
            </Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}
