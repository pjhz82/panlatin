import Link from "next/link";
import { BarraAvance } from "@/components/avance";
import { FormularioPago, FormularioRevertir } from "@/components/formularios-flujo";
import { Encabezado, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { VerDatosPagoBs } from "@/components/campos-pago-bs";
import { requerirUsuario } from "@/lib/auth";
import type { DatosPagoBs } from "@/lib/bancos-ve";
import { fechaCorta, importe } from "@/lib/dinero";
import { cuentasParaPagos, haceDias, pagosReportados, pendientesDePago } from "@/lib/flujo";
import { TIPOS_OPERACION, SIMBOLO } from "@/lib/operaciones";

export const metadata = { title: "Pagos" };

export default async function PaginaPagos() {
  await requerirUsuario(["admin", "operadora"]);
  const hoy = new Date().toISOString().slice(0, 10);
  const hace7 = haceDias(7);
  const [pendientes, { cuentas, limites }, recientes] = await Promise.all([pendientesDePago(), cuentasParaPagos(hoy), pagosReportados(hace7)]);
  const porEnviar = pendientes.filter((p) => p.partida.importe < 0);
  const porRecibir = pendientes.filter((p) => p.partida.importe > 0);

  const lista = (titulo: string, filas: typeof pendientes, vacio: string) => (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">
        {titulo} <span className="text-sm font-normal text-slate-500">({filas.length})</span>
      </h2>
      {filas.length === 0 && <p className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">{vacio}</p>}
      <div className="space-y-3">
        {filas.map(({ op, partida: p, bloqueada }) => (
          <Tarjeta key={p.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">
                  <Link href={`/operaciones/${op.id}`} className="font-medium hover:underline">
                    Op. {op.id}
                  </Link>{" "}
                  · {TIPOS_OPERACION[op.tipo].nombre} · {op.cliente ?? op.descripcion ?? "Sin cliente"}
                  {op.ejecutivo && <span className="text-slate-500"> · {op.ejecutivo}</span>}
                </p>
                <p className="font-medium">{p.descripcion}</p>
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
              </div>
              <div className="text-right">
                <p className="text-sm tabular-nums">
                  Instruido {SIMBOLO[p.moneda!]} {importe(Math.abs(p.importe))}
                </p>
                <p className="text-sm font-semibold tabular-nums text-amber-700">
                  Falta {SIMBOLO[p.moneda!]} {importe(Math.abs(p.avance.falta))}
                </p>
                <BarraAvance pct={p.avance.pct} className="justify-end" />
              </div>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              {bloqueada ? (
                <p className="text-sm text-amber-700">Transferencia de dólares: espera la aprobación de dos ejecutivos.</p>
              ) : (
                <FormularioPago
                  partidaId={p.id}
                  falta={p.avance.falta}
                  moneda={p.moneda!}
                  cuentas={cuentas}
                  bancoDestino={p.bancoDestino}
                  cuentaSugerida={p.cuentaId}
                  hoy={hoy}
                />
              )}
            </div>
          </Tarjeta>
        ))}
      </div>
    </section>
  );

  return (
    <>
      <Encabezado
        titulo="Pagos"
        descripcion="Módulo 2 · La administradora reporta cada pago enviado o recibido, aunque sea por partes. Al reportarlo se mueve el banco."
      />

      {limites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Límites interbancarios de hoy</h2>
          <Tabla>
            <thead>
              <tr>
                <Th>Cuenta</Th>
                <Th className="text-right">Límite</Th>
                <Th className="text-right">Usado</Th>
                <Th className="text-right">Disponible</Th>
                <Th>Uso</Th>
              </tr>
            </thead>
            <tbody>
              {limites.map((l) => (
                <tr key={l.id}>
                  <Td>{l.nombre}</Td>
                  <Td className="text-right tabular-nums">{importe(l.limite)}</Td>
                  <Td className="text-right tabular-nums">{importe(l.usado)}</Td>
                  <Td className={`text-right tabular-nums ${l.disponible < 0 ? "font-semibold text-red-700" : ""}`}>{importe(l.disponible)}</Td>
                  <Td>
                    <BarraAvance pct={l.pct} etiqueta={`${Math.round(l.pct * 100)} % usado`} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <p className="mt-2 text-xs text-slate-500">El límite de cada cuenta se pone en Cuentas. Cuenta lo enviado hoy marcado como interbancario.</p>
        </section>
      )}

      {lista("Por enviar", porEnviar, "No hay pagos por enviar.")}
      {lista("Por recibir", porRecibir, "No hay cobros por recibir.")}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Reportados en los últimos 7 días</h2>
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Op.</Th>
              <Th>Partida</Th>
              <Th>Cuenta</Th>
              <Th className="text-right">Importe</Th>
              <Th>Ref.</Th>
              <Th>Balance</Th>
              <Th>Corregir</Th>
            </tr>
          </thead>
          <tbody>
            {recientes.map((r) => (
              <tr key={r.id} className="align-top">
                <Td className="whitespace-nowrap">{fechaCorta(r.fecha)}</Td>
                <Td>
                  <Link href={`/operaciones/${r.operacionId}`} className="hover:underline">
                    {r.operacionId}
                  </Link>
                </Td>
                <Td>
                  {r.partida}
                  {r.cliente && <span className="block text-xs text-slate-500">{r.cliente}</span>}
                </Td>
                <Td>
                  {r.cuenta}
                  {r.interbancario && <span className="block text-xs text-slate-500">Interbancario</span>}
                </Td>
                <Td className={`whitespace-nowrap text-right tabular-nums ${Number(r.importe) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {SIMBOLO[r.moneda]} {importe(r.importe)}
                </Td>
                <Td className="text-xs">{r.referencia ?? "—"}</Td>
                <Td>{r.balanceEn ? <Insignia color="verde">En balance</Insignia> : Number(r.efectoCliente) ? <Insignia color="ambar">Falta</Insignia> : "—"}</Td>
                <Td>
                  <FormularioRevertir tipo="pago" id={r.id} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </section>
    </>
  );
}
