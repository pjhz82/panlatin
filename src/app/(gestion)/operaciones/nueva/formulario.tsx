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
import { EditorPartidas, hayDolaresQueSalen, leerNumero, SIMBOLO, type CuentaOpcion } from "@/components/editor-partidas";
import { crearOperacion } from "../actions";

type Cuenta = CuentaOpcion;

const fmt = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const leer = leerNumero;

export function FormularioOperacion({
  cuentas,
  subcuentas,
  hoy,
  subcuentaInicial = "",
  esEjecutivo = false,
}: {
  cuentas: Cuenta[];
  subcuentas: string[];
  hoy: string;
  subcuentaInicial?: string;
  /** Quien monta la operación es un ejecutivo: su firma ya cuenta. */
  esEjecutivo?: boolean;
}) {
  const [estado, accion] = useActionState(crearOperacion, estadoInicial);
  const [tipo, setTipo] = useState<TipoOperacion>("compra");
  const [fecha, setFecha] = useState(hoy);
  const [subcuenta, setSubcuenta] = useState(subcuentaInicial);
  const [descripcion, setDescripcion] = useState("");
  const [montoUsd, setMontoUsd] = useState("");
  const [tasa, setTasa] = useState("");
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
    // La comisión bancaria la pone la administradora al reportar cada pago.
    comisionBancoPct: 0,
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


  const resumen = useMemo(() => {
    const porMoneda = new Map<Moneda, number>();
    let cliente = 0;
    for (const p of lista) {
      if (p.moneda && p.importeCuenta) porMoneda.set(p.moneda, (porMoneda.get(p.moneda) ?? 0) + p.importeCuenta);
      cliente += p.efectoCliente;
    }
    return { porMoneda: [...porMoneda.entries()], cliente };
  }, [lista]);

  const selectorCuenta = (valor: number | null, cambiar: (v: number | null) => void, monedas?: Moneda[]) => (
    <Selector value={valor ?? ""} onChange={(e) => cambiar(e.target.value ? Number(e.target.value) : null)}>
      <option value="">La elige la administradora</option>
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
          {pide.bs && <Campo etiqueta="Cuenta en Bs. (opcional)">{selectorCuenta(cuentaBs, (v) => { setCuentaBs(v); setEditadas(null); }, ["BS"])}</Campo>}
          {pide.usd && (
            <Campo etiqueta="Cuenta de los dólares (opcional)">
              {selectorCuenta(cuentaUsd, (v) => { setCuentaUsd(v); setEditadas(null); }, ["USD", "USDT", "USDC"])}
            </Campo>
          )}
          {pide.origen && <Campo etiqueta="Cuenta de origen (opcional)">{selectorCuenta(cuentaOrigen, (v) => { setCuentaOrigen(v); setEditadas(null); })}</Campo>}
          {pide.destino && <Campo etiqueta="Cuenta de destino (opcional)">{selectorCuenta(cuentaDestino, (v) => { setCuentaDestino(v); setEditadas(null); })}</Campo>}
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
              Las instrucciones de pago: qué se paga o cobra, en qué moneda y a dónde. La administradora reporta cada pago, aunque sea por partes.
            </p>
          </div>
          <div className="flex gap-2">
            {editadas && (
              <Boton type="button" variante="secundario" onClick={() => setEditadas(null)}>
                Volver a calcular
              </Boton>
            )}
          </div>
        </div>
        <EditorPartidas lista={lista} cambiar={setEditadas} cuentas={cuentas} />

        <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Neto por moneda (+ entra / − sale)</p>
            {resumen.porMoneda.length === 0 && <p className="text-slate-500">—</p>}
            {resumen.porMoneda.map(([m, v]) => (
              <p key={m} className="flex justify-between gap-2">
                <span>{SIMBOLO[m]}</span>
                <span className={`tabular-nums ${v < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {v > 0 ? "+" : ""}
                  {fmt.format(v)}
                </span>
              </p>
            ))}
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
        <BotonGuardar texto={hayDolaresQueSalen(lista) ? "Dar la instrucción y pedir aprobación" : "Dar la instrucción"} />
        <span className="text-xs text-slate-500">
          {!hayDolaresQueSalen(lista)
            ? "No saca dólares: pasa directo a la administradora para los pagos."
            : esEjecutivo
              ? "Saca dólares: tu firma cuenta como aprobación, falta la de otro ejecutivo."
              : "Saca dólares: necesita la aprobación de dos ejecutivos antes de enviarse."}
        </span>
      </div>
    </Formulario>
  );
}
