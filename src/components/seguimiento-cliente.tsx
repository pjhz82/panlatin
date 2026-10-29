import type { ReactNode } from "react";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { operaciones, pagos } from "@/db/schema";
import { BarraAvance } from "@/components/avance";
import { ListaComprobantes } from "@/components/comprobantes";
import { comprobantesDe } from "@/lib/comprobantes";
import { Encabezado, Insignia, Tarjeta } from "@/components/ui";
import { destinoResumido, type DatosPagoBs } from "@/lib/bancos-ve";
import { fechaCorta, importe } from "@/lib/dinero";
import type { OperacionConAvance } from "@/lib/flujo";
import { SIMBOLO, TIPOS_OPERACION } from "@/lib/operaciones";
import { avanceParaCliente, NOMBRE_PARA_CLIENTE } from "@/lib/vista-cliente";

/**
 * Cómo va una operación, contada al cliente: lo que nos paga, lo que le
 * enviamos y lo aplicado a su estado de cuenta. Sin firmas, cuentas propias
 * ni utilidad. En el enlace público (`publico`) los datos bancarios van
 * resumidos.
 */
export async function SeguimientoCliente({
  o,
  publico,
  volver,
  baseComprobantes,
}: {
  o: OperacionConAvance;
  publico: boolean;
  volver?: ReactNode;
  /** Ruta que sirve los comprobantes para este visitante. */
  baseComprobantes: string;
}) {
  const v = avanceParaCliente(o.estado, o.partidas);
  const [[{ creadoEn }], listaPagos] = await Promise.all([
    db.select({ creadoEn: operaciones.creadoEn }).from(operaciones).where(eq(operaciones.id, o.id)),
    v.partidas.length
      ? db
          .select({ id: pagos.id, partidaId: pagos.partidaId, fecha: pagos.fecha, importe: pagos.importe, referencia: pagos.referencia, balanceEn: pagos.balanceEn })
          .from(pagos)
          .where(inArray(pagos.partidaId, v.partidas.map((p) => p.id)))
          .orderBy(asc(pagos.fecha), asc(pagos.id))
      : Promise.resolve([]),
  ]);

  const listaComprobantes = await comprobantesDe(listaPagos.map((x) => x.id));
  const pasos = [
    { titulo: "Operación cerrada", hecho: true, detalle: fechaCorta(creadoEn) },
    ...(v.recibido !== null ? [{ titulo: "Recibimos tu pago", hecho: v.recibido >= 0.995, detalle: `${Math.round(v.recibido * 100)} %` }] : []),
    ...(v.enviado !== null ? [{ titulo: "Te enviamos el pago", hecho: v.enviado >= 0.995, detalle: `${Math.round(v.enviado * 100)} %` }] : []),
    { titulo: "Aplicada a tu estado de cuenta", hecho: o.estado === "completada", detalle: `${Math.round(o.pctBalance * 100)} %` },
  ];

  return (
    <>
      <Encabezado
        titulo={`${NOMBRE_PARA_CLIENTE[o.tipo] ?? TIPOS_OPERACION[o.tipo].nombre} · Op. ${o.id}`}
        descripcion={
          <>
            <Insignia color={v.estado.color}>{v.estado.texto}</Insignia> · {fechaCorta(o.fecha)} · {o.cliente}
            {volver && <> · {volver}</>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="min-w-0 space-y-3">
          {o.montoUsd && (
            <Tarjeta className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Monto</p>
              <p className="text-xl font-semibold tabular-nums">
                US$ {importe(o.montoUsd)}
                {o.tasa && <span className="ml-2 text-sm font-normal text-slate-500">a {importe(o.tasa)} Bs./US$</span>}
              </p>
            </Tarjeta>
          )}
          {v.partidas.map((p) => {
            const sim = p.moneda ? SIMBOLO[p.moneda] : "US$";
            const ps = listaPagos.filter((x) => x.partidaId === p.id);
            const recibimos = p.importe > 0;
            const destino = publico
              ? destinoResumido(p.datosPago as DatosPagoBs | null, p.bancoDestino)
              : [p.destino, p.datosPago ? null : p.bancoDestino].filter(Boolean).join(" · ");
            return (
              <Tarjeta key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {!p.avance.ladoBanco ? p.descripcion : recibimos ? "Tu pago a nosotros" : "Nuestro pago a ti o por tu cuenta"}
                    </p>
                    {p.avance.ladoBanco && !recibimos && destino && <p className="text-sm text-slate-600">A: {destino}</p>}
                  </div>
                  <p className="text-right font-medium tabular-nums">
                    {p.avance.ladoBanco ? `${sim} ${importe(Math.abs(p.importe))}` : `US$ ${importe(Math.abs(p.efectoCliente))}`}
                  </p>
                </div>
                {p.avance.ladoBanco ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <BarraAvance pct={p.avance.pct} etiqueta={`${Math.round(p.avance.pct * 100)} % ${recibimos ? "recibido" : "enviado"}`} />
                      {!p.avance.pagada && (
                        <span className="tabular-nums text-amber-700">
                          {recibimos ? "Falta recibir" : "Falta enviar"} {sim} {importe(Math.abs(p.avance.falta))}
                        </span>
                      )}
                    </div>
                    {p.ejecutadaEn && <p className="mt-1 text-sm text-emerald-700">✓ {fechaCorta(p.ejecutadaEn)}</p>}
                    {ps.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {ps.map((x) => (
                          <li key={x.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1">
                            <span>
                              {fechaCorta(x.fecha)} ·{" "}
                              <span className="tabular-nums">
                                {sim} {importe(Math.abs(Number(x.importe)))}
                              </span>
                              {x.referencia && <span className="text-slate-500"> · ref. {x.referencia}</span>}{" "}
                              <ListaComprobantes lista={listaComprobantes.filter((c) => c.pagoId === x.id)} base={baseComprobantes} />
                            </span>
                            <span className={`text-xs ${x.balanceEn ? "text-emerald-700" : "text-slate-500"}`}>
                              {x.balanceEn ? "✓ en tu estado de cuenta" : "Por aplicar a tu estado de cuenta"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    {p.efectoCliente < 0 ? "Cargo" : "Abono"} en tu estado de cuenta{p.clienteEn || p.ejecutadaEn ? " · aplicado" : " · por aplicar"}
                  </p>
                )}
              </Tarjeta>
            );
          })}
        </section>
        <Tarjeta className="h-fit p-4">
          <h2 className="mb-3 text-sm font-semibold">Cómo va</h2>
          <ol className="space-y-2 text-sm">
            {pasos.map((paso) => (
              <li key={paso.titulo} className="flex gap-2">
                <span className={`w-4 text-center font-semibold ${paso.hecho ? "text-emerald-700" : "text-slate-400"}`}>{paso.hecho ? "✓" : "○"}</span>
                <span>
                  <span className="font-medium">{paso.titulo}</span>
                  <span className="text-slate-500"> · {paso.detalle}</span>
                </span>
              </li>
            ))}
          </ol>
          {o.estado === "pendiente_firmas" && <p className="mt-3 text-xs text-slate-500">La operación está en revisión interna antes de enviarte los dólares.</p>}
        </Tarjeta>
      </div>
    </>
  );
}
