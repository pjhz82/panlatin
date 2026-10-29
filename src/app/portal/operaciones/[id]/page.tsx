import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { operaciones, pagos } from "@/db/schema";
import { BarraAvance } from "@/components/avance";
import { Encabezado, Insignia, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth";
import { fechaCorta, importe } from "@/lib/dinero";
import { operacionesDeCliente } from "@/lib/flujo";
import { SIMBOLO, TIPOS_OPERACION } from "@/lib/operaciones";
import { avanceParaCliente, NOMBRE_PARA_CLIENTE } from "@/lib/vista-cliente";

export const metadata = { title: "Operación" };

export default async function PaginaMiOperacion({ params }: PageProps<"/portal/operaciones/[id]">) {
  const usuario = await requerirUsuario(["cliente"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  // Solo operaciones de sus subcuentas (abiertas o del último mes).
  const o = (await operacionesDeCliente(usuario.clienteId ?? -1)).find((x) => x.id === id);
  if (!o) notFound();
  const v = avanceParaCliente(o.estado, o.partidas);
  const [{ creadoEn }] = await db.select({ creadoEn: operaciones.creadoEn }).from(operaciones).where(eq(operaciones.id, id));
  const listaPagos = v.partidas.length
    ? await db
        .select({ id: pagos.id, partidaId: pagos.partidaId, fecha: pagos.fecha, importe: pagos.importe, referencia: pagos.referencia, balanceEn: pagos.balanceEn })
        .from(pagos)
        .where(inArray(pagos.partidaId, v.partidas.map((p) => p.id)))
        .orderBy(asc(pagos.fecha), asc(pagos.id))
    : [];

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
            <Insignia color={v.estado.color}>{v.estado.texto}</Insignia> · {fechaCorta(o.fecha)} · {o.cliente} ·{" "}
            <Link href="/portal/operaciones" className="underline">
              ← Mis operaciones
            </Link>
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
            return (
              <Tarjeta key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {!p.avance.ladoBanco ? p.descripcion : recibimos ? "Tu pago a nosotros" : "Nuestro pago a ti o por tu cuenta"}
                    </p>
                    {p.avance.ladoBanco && !recibimos && p.destino && <p className="text-sm text-slate-600">A: {p.destino}{p.bancoDestino && ` · ${p.bancoDestino}`}</p>}
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
                              {x.referencia && <span className="text-slate-500"> · ref. {x.referencia}</span>}
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
