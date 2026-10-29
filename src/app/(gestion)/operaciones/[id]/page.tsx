import Link from "next/link";
import { notFound } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cambios, cuentas, ejecutivos, firmas, firmasCambio, operaciones, pagos, subcuentas, usuarios } from "@/db/schema";
import { BarraAvance } from "@/components/avance";
import {
  BotonRetirarCambio,
  FormularioAlBalance,
  FormularioCerrarPartida,
  FormularioFirmaCambio,
  FormularioPago,
  FormularioRevertir,
} from "@/components/formularios-flujo";
import { Seccion } from "@/components/indicadores";
import { BotonEnlace, Encabezado, Insignia, Tarjeta } from "@/components/ui";
import { VerDatosPagoBs } from "@/components/campos-pago-bs";
import { requerirUsuario } from "@/lib/auth";
import type { DatosPagoBs } from "@/lib/bancos-ve";
import { fechaCorta, importe } from "@/lib/dinero";
import { cuentasParaPagos } from "@/lib/flujo";
import { ESTADOS_OPERACION, esSalidaDeDolares, FIRMAS_REQUERIDAS, TIPOS_OPERACION, SIMBOLO } from "@/lib/operaciones";
import { partidasConAvance, resumenAvance } from "@/lib/pagos";
import type { PropuestaCambio } from "@/lib/esquemas-operacion";
import { FormularioAnular, FormularioFirma } from "./acciones";

export const metadata = { title: "Operación" };

const fechaHora = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" });

function Paso({ hecho, titulo, detalle }: { hecho: boolean | "parcial" | "no_aplica"; titulo: string; detalle?: string }) {
  const icono = hecho === true ? "✓" : hecho === "parcial" ? "◐" : hecho === "no_aplica" ? "–" : "○";
  const color = hecho === true ? "text-emerald-700" : hecho === "parcial" ? "text-sky-700" : "text-slate-400";
  return (
    <li className="flex gap-2 text-sm">
      <span className={`w-4 text-center font-semibold ${color}`}>{icono}</span>
      <span>
        <span className="font-medium">{titulo}</span>
        {detalle && <span className="text-slate-500"> · {detalle}</span>}
      </span>
    </li>
  );
}

export default async function PaginaOperacion({ params }: PageProps<"/operaciones/[id]">) {
  const usuario = await requerirUsuario(["admin", "ejecutivo", "operadora"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const autor = alias(usuarios, "autor");
  const [op] = await db
    .select({ op: operaciones, subcuenta: subcuentas.nombre, autor: autor.nombre, ejecutivo: ejecutivos.codigo })
    .from(operaciones)
    .leftJoin(subcuentas, eq(subcuentas.id, operaciones.subcuentaId))
    .leftJoin(ejecutivos, eq(ejecutivos.id, operaciones.ejecutivoId))
    .innerJoin(autor, eq(autor.id, operaciones.creadoPor))
    .where(eq(operaciones.id, id))
    .limit(1);
  if (!op) notFound();
  const o = op.op;
  const hoy = new Date().toISOString().slice(0, 10);

  const [lista, listaFirmas, miEjecutivo, listaCambios, paraPagos] = await Promise.all([
    partidasConAvance(db, [id]),
    db
      .select({ f: firmas, ejecutivo: ejecutivos.codigo, usuario: usuarios.nombre })
      .from(firmas)
      .innerJoin(ejecutivos, eq(ejecutivos.id, firmas.ejecutivoId))
      .innerJoin(usuarios, eq(usuarios.id, firmas.usuarioId))
      .where(eq(firmas.operacionId, id))
      .orderBy(asc(firmas.creadoEn)),
    usuario.ejecutivoId ? db.select({ codigo: ejecutivos.codigo }).from(ejecutivos).where(eq(ejecutivos.id, usuario.ejecutivoId)) : Promise.resolve([]),
    db
      .select({ c: cambios, autor: usuarios.nombre })
      .from(cambios)
      .innerJoin(usuarios, eq(usuarios.id, cambios.creadoPor))
      .where(eq(cambios.operacionId, id))
      .orderBy(desc(cambios.creadoEn)),
    cuentasParaPagos(hoy),
  ]);
  const idsPartida = lista.map((p) => p.id);
  const reporto = alias(usuarios, "reporto");
  const [listaPagos, firmasDeCambios] = await Promise.all([
    idsPartida.length
      ? db
          .select({ pago: pagos, cuenta: cuentas.nombre, moneda: cuentas.moneda, reporto: reporto.nombre })
          .from(pagos)
          .innerJoin(cuentas, eq(cuentas.id, pagos.cuentaId))
          .innerJoin(reporto, eq(reporto.id, pagos.reportadoPor))
          .where(inArray(pagos.partidaId, idsPartida))
          .orderBy(asc(pagos.fecha), asc(pagos.id))
      : Promise.resolve([]),
    listaCambios.length
      ? db
          .select({ f: firmasCambio, ejecutivo: ejecutivos.codigo })
          .from(firmasCambio)
          .innerJoin(ejecutivos, eq(ejecutivos.id, firmasCambio.ejecutivoId))
          .where(inArray(firmasCambio.cambioId, listaCambios.map((c) => c.c.id)))
      : Promise.resolve([]),
  ]);

  const r = resumenAvance(lista);
  const estado = ESTADOS_OPERACION[o.estado];
  const staff = usuario.rol !== "ejecutivo";
  const abierta = o.estado !== "anulada" && o.estado !== "rechazada";
  const necesitaAprobacion = lista.some((p) => esSalidaDeDolares(p.importe, p.moneda)) || listaFirmas.length > 0;
  const aprobaciones = listaFirmas.filter((f) => f.f.aprueba).length;
  const yaFirme = listaFirmas.some((f) => f.f.ejecutivoId === usuario.ejecutivoId);
  const puedeFirmar = o.estado === "pendiente_firmas" && Boolean(miEjecutivo[0]) && !yaFirme;
  const pendiente = listaCambios.find((c) => c.c.estado === "pendiente");
  const firmasPendiente = pendiente ? firmasDeCambios.filter((f) => f.f.cambioId === pendiente.c.id) : [];
  const yaFirmeCambio = firmasPendiente.some((f) => f.f.ejecutivoId === usuario.ejecutivoId);
  const pagosDe = (partidaId: number) => listaPagos.filter((p) => p.pago.partidaId === partidaId);
  const conBanco = lista.filter((p) => p.avance.ladoBanco);
  const conCliente = lista.filter((p) => p.avance.ladoCliente);

  return (
    <>
      <Encabezado
        titulo={`Op. ${o.id} · ${TIPOS_OPERACION[o.tipo].nombre}`}
        descripcion={
          <>
            <Insignia color={estado.color}>{estado.nombre}</Insignia> · {fechaCorta(o.fecha)}
            {op.subcuenta && (
              <>
                {" · "}
                <Link className="underline" href={`/subcuentas/${o.subcuentaId}`}>
                  {op.subcuenta}
                </Link>
              </>
            )}
            {op.ejecutivo && <> · {op.ejecutivo}</>} · instrucción de {op.autor}
          </>
        }
        acciones={
          abierta && !pendiente && o.origen === "web" ? (
            <BotonEnlace href={`/operaciones/${o.id}/cambiar`} variante="secundario">
              Proponer cambio
            </BotonEnlace>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Tarjeta className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Monto</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{o.montoUsd ? `US$ ${importe(o.montoUsd)}` : "—"}</p>
          {o.tasa && <p className="text-xs text-slate-500">Tasa {importe(o.tasa)}{o.montoBs && ` · Bs. ${importe(o.montoBs)}`}</p>}
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Utilidad estimada</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{o.utilidad ? `US$ ${importe(o.utilidad)}` : "—"}</p>
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pagado y cobrado</p>
          <BarraAvance pct={r.pctPagado} className="mt-2" />
          <p className="mt-1 text-xs text-slate-500">{r.porPagar ? `${r.porPagar} partida(s) por pagar` : "Todo reportado"}</p>
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">En balance del cliente</p>
          <BarraAvance pct={r.pctBalance} className="mt-2" />
          <p className="mt-1 text-xs text-slate-500">{r.porBalance ? `${r.porBalance} partida(s) por llevar` : conCliente.length ? "Al día" : "No afecta a clientes"}</p>
        </Tarjeta>
      </div>

      {o.descripcion && <p className="mb-6 rounded-lg bg-white p-4 text-sm text-slate-700 shadow-sm">{o.descripcion}</p>}
      {o.motivoCierre && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {o.estado === "anulada" ? "Anulada" : "Rechazada"}: {o.motivoCierre}
        </p>
      )}

      {pendiente && (
        <Tarjeta className="mb-6 border-amber-300 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-amber-800">Cambio pendiente de aprobación</h2>
              <p className="text-sm text-slate-600">
                Propuesto por {pendiente.autor} el {fechaHora.format(pendiente.c.creadoEn)}: «{pendiente.c.motivo}»
              </p>
            </div>
            <span className="text-sm tabular-nums">
              {firmasPendiente.filter((f) => f.f.aprueba).length} de {FIRMAS_REQUERIDAS} firmas
            </span>
          </div>
          <ComparacionCambio anterior={pendiente.c.anterior as PropuestaCambio} propuesta={pendiente.c.propuesta as PropuestaCambio} />
          <ul className="mt-3 space-y-1 text-sm">
            {firmasPendiente.map((f) => (
              <li key={f.f.id}>
                <span className="text-emerald-700">✓ Aprueba</span> <span className="font-medium">{f.ejecutivo}</span>
                {f.f.comentario && <span className="text-slate-500"> · «{f.f.comentario}»</span>}
              </li>
            ))}
          </ul>
          {miEjecutivo[0] && !yaFirmeCambio && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <FormularioFirmaCambio cambioId={pendiente.c.id} ejecutivo={miEjecutivo[0].codigo} />
            </div>
          )}
          {(pendiente.c.creadoPor === usuario.id || usuario.rol === "admin") && (
            <div className="mt-3">
              <BotonRetirarCambio cambioId={pendiente.c.id} />
            </div>
          )}
        </Tarjeta>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-3">
          <h2 className="text-lg font-semibold">Seguimiento por partida</h2>
          {lista.map((p) => {
            const ps = pagosDe(p.id);
            const sim = p.moneda ? SIMBOLO[p.moneda] : "";
            const bloqueada = o.estado === "pendiente_firmas" && esSalidaDeDolares(p.importe, p.moneda);
            return (
              <Tarjeta key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {p.orden}. {p.descripcion}
                      {esSalidaDeDolares(p.importe, p.moneda) && <span className="ml-2 text-xs text-amber-700">requiere aprobación</span>}
                    </p>
                    {p.datosPago ? (
                      <VerDatosPagoBs datos={p.datosPago as DatosPagoBs} />
                    ) : (
                      (p.destino || p.bancoDestino) && (
                        <p className="text-sm text-slate-600">
                          {p.importe < 0 ? "A: " : "De: "}
                          {[p.destino, p.bancoDestino].filter(Boolean).join(" · ")}
                        </p>
                      )
                    )}
                    {p.cerradaEn && (
                      <p className="text-xs text-slate-500">
                        Cerrada con diferencia el {fechaCorta(p.cerradaEn)}: {p.cerradaNota}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    {p.avance.ladoBanco && (
                      <p>
                        {p.importe < 0 ? "Pagar" : "Cobrar"} {sim} {importe(Math.abs(p.importe))}
                      </p>
                    )}
                    {p.avance.ladoCliente && <p className="text-slate-500">Cliente US$ {importe(p.efectoCliente)}</p>}
                  </div>
                </div>

                {p.ejecutadaEn ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                    <span className="text-emerald-700">✓ Aplicada de una vez el {fechaCorta(p.ejecutadaEn)} (banco y cliente)</span>
                    {staff && <FormularioRevertir tipo="aplicacion" id={p.id} />}
                  </div>
                ) : (
                  <>
                    {p.avance.ladoBanco && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <BarraAvance pct={p.avance.pct} etiqueta={`${Math.round(p.avance.pct * 100)} % · ${sim} ${importe(Math.abs(p.avance.pagado))}`} />
                          {!p.avance.pagada ? (
                            <span className="font-medium tabular-nums text-amber-700">
                              Falta {sim} {importe(Math.abs(p.avance.falta))}
                            </span>
                          ) : (
                            p.avance.diferencia !== 0 && (
                              <span className="text-xs tabular-nums text-slate-500">
                                Diferencia {sim} {importe(p.avance.diferencia)}
                              </span>
                            )
                          )}
                        </div>
                        {ps.length > 0 && (
                          <ul className="mt-2 space-y-2 text-sm">
                            {ps.map(({ pago, cuenta, reporto }) => (
                              <li key={pago.id} className="rounded-lg bg-slate-50 p-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span>
                                    {fechaCorta(pago.fecha)} · {cuenta} ·{" "}
                                    <span className="tabular-nums">
                                      {sim} {importe(Math.abs(Number(pago.importe)))}
                                    </span>
                                    {pago.referencia && <span className="text-slate-500"> · ref. {pago.referencia}</span>}
                                    {pago.interbancario && <span className="text-slate-500"> · interbancario</span>}
                                    <span className="text-slate-500"> · {reporto}</span>
                                  </span>
                                  {Number(pago.efectoCliente) !== 0 &&
                                    (pago.balanceEn ? (
                                      <span className="text-xs text-emerald-700">✓ en balance {fechaCorta(pago.balanceEn)}</span>
                                    ) : (
                                      <span className="text-xs text-amber-700">Falta llevar al balance</span>
                                    ))}
                                </div>
                                {staff && (
                                  <div className="mt-1 flex flex-wrap items-start gap-4">
                                    {Number(pago.efectoCliente) !== 0 && !pago.balanceEn && (
                                      <FormularioAlBalance tipo="pago" id={pago.id} fecha={pago.fecha} />
                                    )}
                                    {pago.balanceEn && <FormularioRevertir tipo="balancePago" id={pago.id} />}
                                    <FormularioRevertir tipo="pago" id={pago.id} />
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {staff && abierta && !p.avance.pagada && (
                          <div className="mt-3 space-y-2">
                            {bloqueada ? (
                              <p className="text-sm text-amber-700">Espera la aprobación de dos ejecutivos antes de enviarse.</p>
                            ) : (
                              <FormularioPago
                                partidaId={p.id}
                                falta={p.avance.falta}
                                moneda={p.moneda!}
                                cuentas={paraPagos.cuentas}
                                bancoDestino={p.bancoDestino}
                                cuentaSugerida={p.cuentaId}
                                hoy={hoy}
                              />
                            )}
                            {ps.length > 0 && <FormularioCerrarPartida partidaId={p.id} diferencia={`${sim} ${importe(p.avance.diferencia)}`} />}
                          </div>
                        )}
                      </div>
                    )}
                    {!p.avance.ladoBanco && p.avance.ladoCliente && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                        {p.clienteEn ? (
                          <>
                            <span className="text-emerald-700">✓ En el balance del cliente desde el {fechaCorta(p.clienteEn)}</span>
                            {staff && <FormularioRevertir tipo="balancePartida" id={p.id} />}
                          </>
                        ) : (
                          <>
                            <span className="text-amber-700">No mueve banco: falta llevarla al balance del cliente.</span>
                            {staff && abierta && <FormularioAlBalance tipo="partida" id={p.id} fecha={o.fecha} />}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </Tarjeta>
            );
          })}
        </section>

        <div className="space-y-4">
          <Seccion titulo="Cómo va">
            <ol className="space-y-2">
              <Paso hecho titulo="Instrucción dada" detalle={`${fechaHora.format(o.creadoEn)} · ${op.autor}`} />
              <Paso
                hecho={!necesitaAprobacion ? "no_aplica" : o.estado === "pendiente_firmas" ? (aprobaciones ? "parcial" : false) : true}
                titulo="Aprobación de dólares"
                detalle={!necesitaAprobacion ? "no hace falta" : `${aprobaciones} de ${FIRMAS_REQUERIDAS}`}
              />
              <Paso
                hecho={!conBanco.length ? "no_aplica" : r.porPagar === 0 ? true : r.algoHecho ? "parcial" : false}
                titulo="Pagos"
                detalle={conBanco.length ? `${conBanco.length - r.porPagar} de ${conBanco.length} partidas` : "sin banco"}
              />
              <Paso
                hecho={!conCliente.length ? "no_aplica" : r.porBalance === 0 && r.porPagar === 0 ? true : r.pctBalance > 0 ? "parcial" : false}
                titulo="Balance del cliente"
                detalle={conCliente.length ? `${Math.round(r.pctBalance * 100)} %` : "no afecta a clientes"}
              />
              <Paso hecho={o.estado === "completada"} titulo="Completada" />
            </ol>
          </Seccion>

          {necesitaAprobacion && (
            <Seccion titulo="Aprobación de dólares">
              {listaFirmas.length === 0 && <p className="text-sm text-slate-500">Nadie ha firmado todavía.</p>}
              <ul className="space-y-2 text-sm">
                {listaFirmas.map(({ f, ejecutivo, usuario: quien }) => (
                  <li key={f.id}>
                    <span className={f.aprueba ? "text-emerald-700" : "text-red-700"}>{f.aprueba ? "✓ Aprueba" : "✗ Rechaza"}</span>{" "}
                    <span className="font-medium">{ejecutivo}</span> ({quien}) · <span className="text-slate-500">{fechaHora.format(f.creadoEn)}</span>
                    {f.comentario && <span className="block text-slate-600">«{f.comentario}»</span>}
                  </li>
                ))}
              </ul>
              {puedeFirmar && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <FormularioFirma operacionId={o.id} ejecutivo={miEjecutivo[0].codigo} />
                </div>
              )}
              {yaFirme && o.estado === "pendiente_firmas" && <p className="mt-3 text-xs text-slate-500">Ya firmaste. Falta la firma de otro ejecutivo.</p>}
            </Seccion>
          )}

          {listaCambios.some((c) => c.c.estado !== "pendiente") && (
            <Seccion titulo="Cambios anteriores">
              <ul className="space-y-2 text-sm">
                {listaCambios
                  .filter((c) => c.c.estado !== "pendiente")
                  .map((c) => (
                    <li key={c.c.id}>
                      <Insignia color={c.c.estado === "aplicado" ? "verde" : c.c.estado === "rechazado" ? "rojo" : "gris"}>{c.c.estado}</Insignia>{" "}
                      «{c.c.motivo}» <span className="text-slate-500">· {c.autor} · {fechaHora.format(c.c.creadoEn)}</span>
                      {c.c.comentario && <span className="block text-slate-600">{c.c.comentario}</span>}
                    </li>
                  ))}
              </ul>
            </Seccion>
          )}

          {staff && abierta && o.estado !== "completada" && !r.algoHecho && (
            <Seccion titulo="Anular">
              <FormularioAnular operacionId={o.id} />
            </Seccion>
          )}
        </div>
      </div>
    </>
  );
}

/** Antes y después de un cambio propuesto, partida por partida. */
function ComparacionCambio({ anterior, propuesta }: { anterior: PropuestaCambio; propuesta: PropuestaCambio }) {
  const fila = (p: PropuestaCambio["partidas"][number] | undefined) =>
    p ? `${p.descripcion} · ${p.moneda ? `${SIMBOLO[p.moneda]} ${importe(p.importeCuenta)}` : "sin banco"} · cliente ${importe(p.efectoCliente)}${p.destino ? ` · ${p.destino}` : ""}` : "—";
  const ids = new Set([...anterior.partidas.map((p) => p.id), ...propuesta.partidas.map((p) => p.id)]);
  const filas = [...ids].map((pid) => ({
    antes: pid === undefined ? undefined : anterior.partidas.find((p) => p.id === pid),
    despues: propuesta.partidas.find((p) => p.id === pid),
  }));
  const nuevas = propuesta.partidas.filter((p) => p.id === undefined);
  const generales = (["montoUsd", "tasa", "utilidad"] as const).filter((k) => anterior[k] !== propuesta[k]);
  return (
    <div className="mt-3 overflow-x-auto text-sm">
      {generales.map((k) => (
        <p key={k}>
          {k === "montoUsd" ? "Monto US$" : k === "tasa" ? "Tasa" : "Utilidad"}: <span className="text-slate-500 line-through">{anterior[k] ?? "—"}</span> → <b>{propuesta[k] ?? "—"}</b>
        </p>
      ))}
      <table className="mt-2 w-full min-w-[560px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1 pr-2">Antes</th>
            <th className="pb-1">Después</th>
          </tr>
        </thead>
        <tbody>
          {filas
            .filter((f) => f.antes)
            .map((f, i) => {
              const igual = JSON.stringify(f.antes) === JSON.stringify(f.despues ? { ...f.despues } : undefined);
              return (
                <tr key={i} className={`border-t border-slate-100 align-top ${igual ? "text-slate-400" : ""}`}>
                  <td className="py-1 pr-2">{fila(f.antes)}</td>
                  <td className="py-1">{f.despues ? (igual ? "sin cambios" : fila(f.despues)) : <span className="text-red-700">Se quita</span>}</td>
                </tr>
              );
            })}
          {nuevas.map((p, i) => (
            <tr key={`n${i}`} className="border-t border-slate-100 align-top">
              <td className="py-1 pr-2 text-slate-400">—</td>
              <td className="py-1 text-emerald-700">Nueva: {fila(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
