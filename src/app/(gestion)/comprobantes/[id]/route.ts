import { requerirUsuario } from "@/lib/auth";
import { respuestaComprobante } from "@/lib/comprobantes";

/** Comprobante de un pago, para el equipo. */
export async function GET(_req: Request, { params }: RouteContext<"/comprobantes/[id]">) {
  await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  return respuestaComprobante(Number((await params).id));
}
