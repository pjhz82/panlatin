import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { operaciones, subcuentas } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { respuestaComprobante } from "@/lib/comprobantes";

/** Comprobante de un pago de una operación del cliente. */
export async function GET(_req: Request, { params }: RouteContext<"/portal/comprobantes/[id]">) {
  const usuario = await requerirUsuario(["cliente"]);
  const suyas = db.select({ id: subcuentas.id }).from(subcuentas).where(eq(subcuentas.clienteId, usuario.clienteId ?? -1));
  return respuestaComprobante(Number((await params).id), inArray(operaciones.subcuentaId, suyas));
}
