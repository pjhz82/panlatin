import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, subcuentas } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { filtroSubcuentas } from "@/lib/alcance";
import { cabeceraDescarga, pdfEstadoDeCuenta } from "@/lib/pdf-estado";

const fecha = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** El cliente descarga su propio estado de cuenta en PDF. */
export async function GET(request: Request, ctx: RouteContext<"/portal/[id]/pdf">) {
  const usuario = await requerirUsuario(["cliente"]);
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) notFound();
  const [sub] = await db
    .select({ id: subcuentas.id, nombre: subcuentas.nombre, cliente: clientes.nombre })
    .from(subcuentas)
    .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
    .where(and(eq(subcuentas.id, id), filtroSubcuentas(usuario), eq(subcuentas.activa, true)))
    .limit(1);
  if (!sub) notFound();
  const url = new URL(request.url);
  const pdf = await pdfEstadoDeCuenta({
    subcuentaId: sub.id,
    nombre: sub.nombre,
    cliente: sub.cliente,
    desde: fecha(url.searchParams.get("desde")),
    hasta: fecha(url.searchParams.get("hasta")),
  });
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraDescarga(`Estado de cuenta - ${sub.nombre}`),
      "Cache-Control": "private, no-store",
    },
  });
}
