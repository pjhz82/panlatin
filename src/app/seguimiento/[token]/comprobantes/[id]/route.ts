import { eq } from "drizzle-orm";
import { operaciones } from "@/db/schema";
import { respuestaComprobante } from "@/lib/comprobantes";

/** Comprobante desde el enlace público: solo de la operación de ese enlace. */
export async function GET(_req: Request, { params }: RouteContext<"/seguimiento/[token]/comprobantes/[id]">) {
  const { token, id } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("No encontrado", { status: 404 });
  return respuestaComprobante(Number(id), eq(operaciones.enlaceToken, token));
}
