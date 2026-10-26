import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientes, subcuentas } from "@/db/schema";
import { requerirUsuario } from "@/lib/auth";
import { filtroSubcuentas } from "@/lib/alcance";
import { registrarAuditoria } from "@/lib/auditoria";
import { cabeceraDescarga, pdfEstadoDeCuenta } from "@/lib/pdf-estado";

const fecha = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Descarga el estado de cuenta de una subcuenta en PDF (?desde=AAAA-MM-DD&hasta=…). */
export async function GET(request: Request, ctx: RouteContext<"/subcuentas/[id]/pdf">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) notFound();
  const [sub] = await db
    .select({ id: subcuentas.id, nombre: subcuentas.nombre, cliente: clientes.nombre })
    .from(subcuentas)
    .innerJoin(clientes, eq(clientes.id, subcuentas.clienteId))
    .where(and(eq(subcuentas.id, id), filtroSubcuentas(usuario)))
    .limit(1);
  if (!sub) notFound();

  const url = new URL(request.url);
  const desde = fecha(url.searchParams.get("desde"));
  const hasta = fecha(url.searchParams.get("hasta"));
  const pdf = await pdfEstadoDeCuenta({ subcuentaId: sub.id, nombre: sub.nombre, cliente: sub.cliente, desde, hasta });
  await registrarAuditoria({ usuarioId: usuario.id, accion: "crear", entidad: "pdf_estado_cuenta", entidadId: sub.id, detalle: { desde, hasta } });
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraDescarga(`Estado de cuenta - ${sub.nombre} - ${new Date().toISOString().slice(0, 10)}`),
      "Cache-Control": "private, no-store",
    },
  });
}
