"use client";

import { Boton, Entrada, Selector } from "@/components/ui";
import type { Moneda } from "@/db/schema";
import { CamposPagoBs } from "@/components/campos-pago-bs";
import { datosPagoVacios } from "@/lib/bancos-ve";
import { leerImporte } from "@/lib/importes";
import { esSalidaDeDolares, SIMBOLO, type PartidaBorrador } from "@/lib/operaciones";

export type CuentaOpcion = { id: number; nombre: string; moneda: Moneda; entidad: string | null };

const MONEDAS: Moneda[] = ["BS", "USD", "USDT", "USDC"];

export const leerNumero = leerImporte;

export { SIMBOLO };

export const hayDolaresQueSalen = (lista: PartidaBorrador[]) => lista.some((p) => esSalidaDeDolares(p.importeCuenta, p.moneda));

/**
 * Lista editable de partidas: qué se paga o cobra, en qué moneda, a dónde y
 * su efecto en el cliente. `fijas` son partidas con pagos: no se quitan ni
 * se les cambia la moneda.
 */
export function EditorPartidas({
  lista,
  cambiar,
  cuentas,
  fijas = [],
}: {
  lista: PartidaBorrador[];
  cambiar: (lista: PartidaBorrador[]) => void;
  cuentas: CuentaOpcion[];
  fijas?: number[];
}) {
  const editar = (i: number, cambio: Partial<PartidaBorrador>) => cambiar(lista.map((p, j) => (j === i ? { ...p, ...cambio } : p)));
  return (
    <div className="space-y-3">
      {lista.map((p, i) => {
        const fija = p.id !== undefined && fijas.includes(p.id);
        const dolares = esSalidaDeDolares(p.importeCuenta, p.moneda);
        const pagoBs = p.moneda === "BS" && p.importeCuenta < 0;
        return (
          <div key={p.id ?? `n${i}`} className="rounded-lg border border-slate-200 p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_8rem_10rem_10rem]">
              <label className="text-xs text-slate-500">
                {i + 1}. Qué se paga o cobra
                <Entrada value={p.descripcion} onChange={(e) => editar(i, { descripcion: e.target.value })} />
              </label>
              <label className="text-xs text-slate-500">
                Moneda
                <Selector
                  value={p.moneda ?? ""}
                  disabled={fija}
                  onChange={(e) => {
                    const moneda = (e.target.value || null) as Moneda | null;
                    const cuenta = cuentas.find((c) => c.id === p.cuentaId);
                    editar(i, { moneda, importeCuenta: moneda ? p.importeCuenta : 0, cuentaId: cuenta && cuenta.moneda === moneda ? p.cuentaId : null });
                  }}
                >
                  <option value="">Sin banco</option>
                  {MONEDAS.map((m) => (
                    <option key={m} value={m}>
                      {SIMBOLO[m]}
                    </option>
                  ))}
                </Selector>
              </label>
              <label className="text-xs text-slate-500">
                Importe (+ cobro / − pago)
                <Entrada
                  key={`c-${i}-${p.importeCuenta}`}
                  inputMode="decimal"
                  disabled={!p.moneda}
                  defaultValue={p.importeCuenta || ""}
                  onBlur={(e) => editar(i, { importeCuenta: leerNumero(e.target.value) })}
                  className="text-right"
                />
              </label>
              <label className="text-xs text-slate-500">
                Cliente US$ (+ abono / − cargo)
                <Entrada
                  key={`e-${i}-${p.efectoCliente}`}
                  inputMode="decimal"
                  defaultValue={p.efectoCliente || ""}
                  onBlur={(e) => editar(i, { efectoCliente: leerNumero(e.target.value) })}
                  className="text-right"
                />
              </label>
            </div>
            {pagoBs && (
              <div className="mt-2">
                <CamposPagoBs valor={p.datosPago ?? datosPagoVacios()} cambiar={(d) => editar(i, { datosPago: d })} />
              </div>
            )}
            {p.moneda && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,2fr)_10rem_minmax(0,1fr)]">
                {pagoBs ? (
                  <span className="text-xs text-slate-500 sm:col-span-2 sm:self-end sm:pb-2">El destino sale de los datos del beneficiario.</span>
                ) : (
                  <>
                    <label className="text-xs text-slate-500">
                      {p.importeCuenta < 0 ? "A dónde se paga (beneficiario, cuenta o wallet)" : "De dónde se cobra (opcional)"}
                      <Entrada value={p.destino ?? ""} onChange={(e) => editar(i, { destino: e.target.value })} placeholder="Ej.: Comercial XYZ · cta. 0102-…-4821" />
                    </label>
                    <label className="text-xs text-slate-500">
                      Banco de destino
                      <Entrada value={p.bancoDestino ?? ""} onChange={(e) => editar(i, { bancoDestino: e.target.value })} placeholder="Ej.: Banesco" />
                    </label>
                  </>
                )}
                <label className="text-xs text-slate-500">
                  Cuenta nuestra sugerida (opcional)
                  <Selector value={p.cuentaId ?? ""} onChange={(e) => editar(i, { cuentaId: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">La elige la administradora</option>
                    {cuentas
                      .filter((c) => c.moneda === p.moneda)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </Selector>
                </label>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className={dolares ? "font-medium text-amber-700" : "text-slate-500"}>
                {dolares ? "Transferencia de dólares: necesita la aprobación de dos ejecutivos." : p.moneda ? "" : "No mueve banco: va directo al balance del cliente."}
                {fija && " Tiene pagos: no se puede quitar ni cambiar de moneda."}
              </span>
              {!fija && (
                <button type="button" className="text-red-700 underline" onClick={() => cambiar(lista.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              )}
            </div>
          </div>
        );
      })}
      <Boton
        type="button"
        variante="secundario"
        onClick={() => cambiar([...lista, { descripcion: "", cuentaId: null, moneda: "BS", importeCuenta: 0, efectoCliente: 0, destino: "", bancoDestino: "" }])}
      >
        Añadir partida
      </Boton>
    </div>
  );
}
