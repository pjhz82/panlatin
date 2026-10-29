import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cambios, cuentas, operaciones } from "@/db/schema";
import { FormularioCambio } from "@/components/formularios-flujo";
import { Encabezado, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import type { DatosPagoBs } from "@/lib/bancos-ve";
import { TIPOS_OPERACION } from "@/lib/operaciones";
import { partidasConAvance } from "@/lib/pagos";

export const metadata = { title: "Proponer cambio" };

const texto = (v: string | null) => (v === null ? "" : String(Number(v)));

export default async function PaginaCambiar({ params }: PageProps<"/operaciones/[id]/cambiar">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [op] = await db.select().from(operaciones).where(eq(operaciones.id, id));
  if (!op) notFound();
  const [pendiente] = await db.select({ id: cambios.id }).from(cambios).where(and(eq(cambios.operacionId, id), eq(cambios.estado, "pendiente")));
  if (pendiente || op.estado === "anulada" || op.estado === "rechazada") redirect(`/operaciones/${id}`);

  const [lista, listaCuentas] = await Promise.all([
    partidasConAvance(db, [id]),
    db
      .select({ id: cuentas.id, nombre: cuentas.nombre, moneda: cuentas.moneda, entidad: cuentas.entidad })
      .from(cuentas)
      .where(eq(cuentas.activa, true))
      .orderBy(asc(cuentas.nombre)),
  ]);
  const fijas = lista.filter((p) => p.numPagos > 0 || p.ejecutadaEn || p.clienteEn).map((p) => p.id);

  return (
    <>
      <Encabezado
        titulo={`Proponer cambio · Op. ${op.id}`}
        descripcion={
          <>
            {TIPOS_OPERACION[op.tipo].nombre} ·{" "}
            <Link href={`/operaciones/${op.id}`} className="underline">
              volver al seguimiento
            </Link>
            . Deja la operación como debería quedar; el cambio se aplica cuando lo aprueban dos ejecutivos.
          </>
        }
      />
      <Tarjeta className="p-6">
        <FormularioCambio
          operacionId={op.id}
          esEjecutivo={Boolean(usuario.ejecutivoId)}
          cuentas={listaCuentas}
          fijas={fijas}
          inicial={{
            descripcion: op.descripcion ?? "",
            montoUsd: texto(op.montoUsd),
            tasa: texto(op.tasa),
            utilidad: texto(op.utilidad),
            partidas: lista.map((p) => ({
              id: p.id,
              descripcion: p.descripcion,
              cuentaId: p.cuentaId,
              moneda: p.moneda,
              importeCuenta: p.importe,
              efectoCliente: p.efectoCliente,
              destino: p.destino ?? "",
              bancoDestino: p.bancoDestino ?? "",
              datosPago: (p.datosPago as DatosPagoBs | null) ?? null,
            })),
          }}
        />
        {fijas.length > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            Las partidas que ya tienen pagos no se pueden quitar ni cambiar de moneda. Para corregir un pago mal reportado, usa «Corregir pago» en el seguimiento.
          </p>
        )}
      </Tarjeta>
    </>
  );
}
