import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { operaciones } from "@/db/schema";
import { SeguimientoCliente } from "@/components/seguimiento-cliente";
import { operacionesConAvance } from "@/lib/flujo";

export const metadata = { title: "Seguimiento de operación" };
// Siempre al día: lo que se reporta en pagos y balance se ve al recargar.
export const dynamic = "force-dynamic";

/**
 * Enlace público para el cliente: sin usuario, muestra solo esta operación.
 * El token es aleatorio y se puede revocar desde la operación.
 */
export default async function PaginaSeguimientoPublico({ params }: PageProps<"/seguimiento/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const [o] = await operacionesConAvance(null, 1, eq(operaciones.enlaceToken, token));
  if (!o) notFound();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Panlatin · Seguimiento de operación</p>
      <SeguimientoCliente o={o} publico baseComprobantes={`/seguimiento/${token}/comprobantes`} />
      <p className="mt-8 text-xs text-slate-500">
        Este enlace es personal: muestra solo esta operación y se actualiza a medida que avanza. Si tienes dudas, escribe a tu ejecutivo.
      </p>
    </div>
  );
}
