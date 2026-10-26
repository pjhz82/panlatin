"use client";

import { useActionState, useMemo, useState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { AreaTexto, Aviso, Boton, Campo, Entrada, Selector, Tarjeta } from "@/components/ui";
import type { Moneda, TipoOperacion } from "@/db/schema";
import { estadoInicial } from "@/lib/formularios";
import {
  CON_CLIENTE,
  cuentasQuePide,
  proponerPartidas,
  proponerUtilidad,
  TIPOS_OPERACION,
  type PartidaBorrador,
} from "@/lib/operaciones";
import { crearOperacion } from "../actions";

type Cuenta = { id: number; nombre: string; moneda: Moneda };

const fmt = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SIMBOLO: Record<Moneda, string> = { BS: "Bs.", USD: "US$", USDT: "USDT", USDC: "USDC" };
const num = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
/** Acepta 1.234,56 o 1234.56 */
const leer = (v: string) => (v.includes(",") ? num(v) : Number(v) || 0);

export function FormularioOperacion({ cuentas, subcuentas, hoy }: { cuentas: Cuenta[]; subcuentas: string[]; hoy: string }) {
  const [estado, accion] = useActionState(crearOperacion, estadoInicial);
  const [tipo, setTipo] = useState<TipoOperacion>("compra");
  const [fecha, setFecha] = useState(hoy);
  const [subcuenta, setSubcuenta] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [montoUsd, setMontoUsd] = useState("");
  const [tasa, setTasa] = useState("");
  const [comBanco, setComBanco] = useState("0.3");
  const [comCliente, setComCliente] = useState("0");
  const [costeLiq, setCosteLiq] = useState("0");
  const [cuentaBs, setCuentaBs] = useState<number | null>(null);
  const [cuentaUsd, setCuentaUsd] = useState<number | null>(null);
  const [cuentaOrigen, setCuentaOrigen] = useState<number | null>(null);
  const [cuentaDestino, setCuentaDestino] = useState<number | null>(null);
  const [editadas, setEditadas] = useState<PartidaBorrador[] | null>(null);
  const [utilidadManual, setUtilidadManual] = useState<string | null>(null);

  const monedaDe = (id: number | null) => cuentas.find((c) => c.id === id)?.moneda ?? null;
  const generales = {
    tipo,
    montoUsd: leer(montoUsd),
    tasa: leer(tasa),
    comisionBancoPct: leer(comBanco),
    comisionClientePct: leer(comCliente),
    costeLiquidacionPct: leer(costeLiq),
    cuentaBs,
    cuentaUsd,
    cuentaOrigen,
    cuentaDestino,
  };
  const propuestas = proponerPartidas(generales, monedaDe);
  const lista = editadas ?? propuestas;
  const utilidad = utilidadManual ?? String(proponerUtilidad(generales));
  const pide = cuentasQuePide(tipo);
  const conCliente = CON_CLIENTE.includes(tipo);

  const editar = (i: number, cambio: Partial<PartidaBorrador>) =>
    setEditadas(lista.map((p, j) => (j === i ? { ...p, ...cambio } : p)));

  const resumen = useMemo(() => {
    const porCuenta = new Map<number, number>();
    let cliente = 0;
    for (const p of lista) {
      if (p.cuentaId) porCuenta.set(p.cuentaId, (porCuenta.get(p.cuentaId) ?? 0) + p.importeCuenta);
      cliente += p.efectoCliente;
    }
    return { porCuenta: [...porCuenta.entries()], cliente };
  }, [lista]);

  const selectorCuenta = (valor: number | null, cambiar: (v: number | null) => void, monedas?: Moneda[]) => (
    <Selector value={valor ?? ""} onChange={(e) => cambiar(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Elige…</option>
      {cuentas
        .filter((c) => !monedas || monedas.includes(c.moneda))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({SIMBOLO[c.moneda]})
          </option>
        ))}
    </Selector>
  );

  const datos = JSON.stringify({
    tipo,
    fecha,
    subcuenta: conCliente || subcuenta ? subcuenta : undefined,
    descripcion,
    montoUsd: montoUsd ? leer(montoUsd) : null,
    tasa: tasa ? leer(tasa) : null,
    montoBs: montoUsd && tasa ? Math.round(leer(montoUsd) * leer(tasa) * 100) / 100 : null,
    utilidad: utilidad === "" ? null : leer(utilidad),
    partidas: lista,
  });

  return (
    <Formulario accion={accion} estado={estado} className="space-y-6">
      <input type="hidden" name="datos" value={datos} />
      {estado.error && <Aviso>{estado.error}</Aviso>}

      <Tarjeta className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Tipo de operación" ayuda={TIPOS_OPERACION[tipo].ayuda}>
            <Selector
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoOperacion);
                setEditadas(null);
                setUtilidadManual(null);
              }}
            >
              {Object.entries(TIPOS_OPERACION).map(([v, t]) => (
                <option key={v} value={v}>
                  {t.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Fecha">
            <Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </Campo>
          <Campo etiqueta={conCliente ? "Cliente (subcuenta)" : "Cliente (opcional)"} ayuda="Escribe para buscar.">
            <Entrada list="lista-subcuentas" value={subcuenta} onChange={(e) => setSubcuenta(e.target.value)} placeholder="Ej.: MDC - Axon" />
            <datalist id="lista-subcuentas">
              {subcuentas.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Monto en US$">
            <Entrada inputMode="decimal" value={montoUsd} onChange={(e) => { setMontoUsd(e.target.value); setEditadas(null); }} placeholder="10000" />
          </Campo>
          <Campo etiqueta="Tasa (Bs. por US$)" ayuda={montoUsd && tasa ? `= Bs. ${fmt.format(leer(montoUsd) * leer(tasa))}` : "Se pone a mano."}>
            <Entrada inputMode="decimal" value={tasa} onChange={(e) => { setTasa(e.target.value); setEditadas(null); }} placeholder="133,5" />
          </Campo>
          <Campo etiqueta="Utilidad (US$)" ayuda="Calculada con las comisiones; puedes cambiarla.">
            <Entrada inputMode="decimal" value={utilidad} onChange={(e) => setUtilidadManual(e.target.value)} />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {(tipo === "compra") && (
            <Campo etiqueta="% comisión bancaria (sobre Bs.)">
              <Entrada inputMode="decimal" value={comBanco} onChange={(e) => { setComBanco(e.target.value); setEditadas(null); }} />
            </Campo>
          )}
          {(tipo === "compra" || tipo === "venta" || tipo === "swap") && (
            <Campo etiqueta={tipo === "swap" ? "% del swap" : "% comisión al cliente"}>
              <Entrada inputMode="decimal" value={comCliente} onChange={(e) => { setComCliente(e.target.value); setEditadas(null); setUtilidadManual(null); }} />
            </Campo>
          )}
          {(tipo === "venta" || tipo === "liquidacion_usdt") && (
            <Campo etiqueta="% coste de liquidación USDT" ayuda="Habitual: 0,3 % USA · 0,6 % otros">
              <Entrada inputMode="decimal" value={costeLiq} onChange={(e) => { setCosteLiq(e.target.value); setEditadas(null); setUtilidadManual(null); }} />
            </Campo>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {pide.bs && <Campo etiqueta="Cuenta en Bs.">{selectorCuenta(cuentaBs, (v) => { setCuentaBs(v); setEditadas(null); }, ["BS"])}</Campo>}
          {pide.usd && (
            <Campo etiqueta="Cuenta de los dólares (banco, wallet, caja…)">
              {selectorCuenta(cuentaUsd, (v) => { setCuentaUsd(v); setEditadas(null); }, ["USD", "USDT", "USDC"])}
            </Campo>
          )}
          {pide.origen && <Campo etiqueta="Cuenta de origen (sale)">{selectorCuenta(cuentaOrigen, (v) => { setCuentaOrigen(v); setEditadas(null); })}</Campo>}
          {pide.destino && <Campo etiqueta="Cuenta de destino (entra)">{selectorCuenta(cuentaDestino, (v) => { setCuentaDestino(v); setEditadas(null); })}</Campo>}
        </div>

        <Campo etiqueta="Descripción / observaciones">
          <AreaTexto rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Pagado a…, referencia del cliente…" />
        </Campo>
      </Tarjeta>

      <Tarjeta className="p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Partidas (pagos y cobros)</h2>
            <p className="text-xs text-slate-500">
              Cuenta: + entra / − sale, en la moneda de la cuenta. Cliente: + abono / − cargo, en US$.
            </p>
          </div>
          <div className="flex gap-2">
            {editadas && (
              <Boton type="button" variante="secundario" onClick={() => setEditadas(null)}>
                Volver a calcular
              </Boton>
            )}
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setEditadas([...lista, { descripcion: "", cuentaId: null, importeCuenta: 0, efectoCliente: 0 }])}
            >
              Añadir partida
            </Boton>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-2">Descripción</th>
                <th className="pb-2 pr-2">Cuenta</th>
                <th className="pb-2 pr-2 text-right">Importe cuenta</th>
                <th className="pb-2 pr-2 text-right">Efecto cliente US$</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((p, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2">
                    <Entrada value={p.descripcion} onChange={(e) => editar(i, { descripcion: e.target.value })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Selector value={p.cuentaId ?? ""} onChange={(e) => editar(i, { cuentaId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— Sin cuenta —</option>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({SIMBOLO[c.moneda]})
                        </option>
                      ))}
                    </Selector>
                  </td>
                  <td className="w-40 py-1.5 pr-2">
                    <Entrada
                      key={`c-${i}-${p.importeCuenta}`}
                      inputMode="decimal"
                      defaultValue={p.importeCuenta || ""}
                      onBlur={(e) => editar(i, { importeCuenta: leer(e.target.value) })}
                      className="text-right"
                    />
                  </td>
                  <td className="w-40 py-1.5 pr-2">
                    <Entrada
                      key={`e-${i}-${p.efectoCliente}`}
                      inputMode="decimal"
                      defaultValue={p.efectoCliente || ""}
                      onBlur={(e) => editar(i, { efectoCliente: leer(e.target.value) })}
                      className="text-right"
                    />
                  </td>
                  <td className="py-1.5">
                    <button type="button" className="text-xs text-red-700 underline" onClick={() => setEditadas(lista.filter((_, j) => j !== i))}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Efecto en las cuentas</p>
            {resumen.porCuenta.length === 0 && <p className="text-slate-500">—</p>}
            {resumen.porCuenta.map(([id, v]) => {
              const c = cuentas.find((x) => x.id === id);
              return (
                <p key={id} className="flex justify-between gap-2">
                  <span>{c?.nombre}</span>
                  <span className={`tabular-nums ${v < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {v > 0 ? "+" : ""}
                    {c ? SIMBOLO[c.moneda] : ""} {fmt.format(v)}
                  </span>
                </p>
              );
            })}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Efecto neto en el cliente</p>
            <p className="tabular-nums">
              US$ {fmt.format(resumen.cliente)}{" "}
              <span className="text-xs text-slate-500">
                {Math.abs(resumen.cliente) < 0.005 ? "(queda a cero al completarse)" : resumen.cliente > 0 ? "(a su favor)" : "(por cobrar)"}
              </span>
            </p>
          </div>
        </div>
      </Tarjeta>

      <div className="flex items-center gap-3">
        <BotonGuardar texto="Crear operación y pedir firmas" />
        <span className="text-xs text-slate-500">Quedará pendiente hasta que la firmen dos ejecutivos.</span>
      </div>
    </Formulario>
  );
}
