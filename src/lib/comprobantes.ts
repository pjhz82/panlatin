import "server-only";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@/db";
import * as s from "@/db/schema";

type Tx = Pick<NodePgDatabase<typeof s>, "insert">;

export const MAX_COMPROBANTE = 5 * 1024 * 1024;
/** Solo fotos y PDF: nunca se sirve HTML ni otros tipos que el navegador pueda ejecutar. */
const TIPOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** El archivo subido, si hay uno; o un error si no vale. */
export function leerArchivo(valor: FormDataEntryValue | null): { archivo: File | null } | { error: string } {
  if (!(valor instanceof File) || valor.size === 0) return { archivo: null };
  if (!TIPOS[valor.type]) return { error: "El comprobante tiene que ser una foto (JPG, PNG, WEBP, HEIC) o un PDF." };
  if (valor.size > MAX_COMPROBANTE) return { error: "El comprobante pesa más de 5 MB." };
  return { archivo: valor };
}

export async function guardarComprobante(tx: Tx, pagoId: number, archivo: File, usuarioId: number) {
  const nombre = archivo.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `comprobante.${TIPOS[archivo.type]}`;
  await tx.insert(s.comprobantes).values({
    pagoId,
    nombre,
    tipo: archivo.type,
    tamano: archivo.size,
    datos: Buffer.from(await archivo.arrayBuffer()),
    subidoPor: usuarioId,
  });
}

/** Comprobantes (sin el contenido) de unos pagos. */
export async function comprobantesDe(pagoIds: number[]) {
  if (!pagoIds.length) return [];
  return db
    .select({ id: s.comprobantes.id, pagoId: s.comprobantes.pagoId, nombre: s.comprobantes.nombre, tipo: s.comprobantes.tipo, tamano: s.comprobantes.tamano })
    .from(s.comprobantes)
    .where(inArray(s.comprobantes.pagoId, pagoIds));
}
export type ComprobanteInfo = Awaited<ReturnType<typeof comprobantesDe>>[number];

/**
 * Respuesta con el archivo, si el comprobante existe y cumple `condicion`
 * (sobre la operación de su pago). Si no, 404.
 */
export async function respuestaComprobante(id: number, condicion?: SQL) {
  if (!Number.isInteger(id)) return new Response("No encontrado", { status: 404 });
  const [c] = await db
    .select({ nombre: s.comprobantes.nombre, tipo: s.comprobantes.tipo, datos: s.comprobantes.datos })
    .from(s.comprobantes)
    .innerJoin(s.pagos, eq(s.pagos.id, s.comprobantes.pagoId))
    .innerJoin(s.partidas, eq(s.partidas.id, s.pagos.partidaId))
    .innerJoin(s.operaciones, eq(s.operaciones.id, s.partidas.operacionId))
    .where(and(eq(s.comprobantes.id, id), condicion));
  if (!c || !TIPOS[c.tipo]) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(c.datos), {
    headers: {
      "Content-Type": c.tipo,
      "Content-Disposition": `inline; filename="${c.nombre.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
