"use client";

import { useActionState, useState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { EditorPartidas, hayDolaresQueSalen, SIMBOLO, type CuentaOpcion } from "@/components/editor-partidas";
import { CamposPagoBs } from "@/components/campos-pago-bs";
import { datosPagoVacios } from "@/lib/bancos-ve";
import { AreaTexto, Aviso, Boton, Campo, Entrada, Selector } from "@/components/ui";
import type { Moneda } from "@/db/schema";
import { estadoInicial, type EstadoFormulario } from "@/lib/formularios";
import { leerImporte } from "@/lib/importes";
import { esInterbancario, type PartidaBorrador } from "@/lib/operaciones";
import {
  cerrarPartida,
  crearAdministrativa,
  firmarCambio,
  pagoAlBalance,
  partidaAlBalance,
  proponerCambio,
  reportarPago,
  retirarCambio,
  revertirAplicacion,
  revertirBalancePago,
  revertirBalancePartida,
  revertirPago,
} from "@/app/(gestion)/operaciones/acciones-flujo";

const fmt = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Resultado({ estado }: { estado: EstadoFormulario }) {
  if (estado.error) return <span className="w-full text-xs text-red-700">{estado.error}</span>;
  if (estado.ok && estado.mensaje) return <span className="w-full text-xs text-emerald-700">{estado.mensaje}</span>;
  return null;
}

export type CuentaPago = CuentaOpcion & { disponible: number | null };

/** Módulo 2: reportar un pago enviado o recibido (total o una parte). */
export function FormularioPago({
  partidaId,
  falta,
  moneda,
  cuentas,
  bancoDestino,
  cuentaSugerida,
  hoy,
}: {
  partidaId: number;
  /** Con signo: negativo = falta por enviar; positivo = falta por recibir. */
  falta: number;
  moneda: Moneda;
  cuentas: CuentaPago[];
  bancoDestino: string | null;
  cuentaSugerida: number | null;
  hoy: string;
}) {
  const [estado, accion] = useActionState(reportarPago.bind(null, partidaId), estadoInicial);
  const opciones = cuentas.filter((c) => c.moneda === moneda);
  const [cuentaId, setCuentaId] = useState<number | null>(cuentaSugerida ?? (opciones.length === 1 ? opciones[0].id : null));
  const [monto, setMonto] = useState(fmt.format(Math.abs(falta)));
  const cuenta = opciones.find((c) => c.id === cuentaId);
  const sale = falta < 0;
  const [interbancario, setInterbancario] = useState<boolean | null>(null);
  const marcado = interbancario ?? (sale && esInterbancario(cuenta?.entidad, bancoDestino));
  const pasa = sale && marcado && cuenta?.disponible !== null && cuenta !== undefined && leerImporte(monto) > (cuenta.disponible ?? Infinity);

  return (
    <Formulario accion={accion} estado={estado} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">
        {sale ? "Sale de" : "Entra en"}
        <Selector name="cuentaId" value={cuentaId ?? ""} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)} className="w-56" required>
          <option value="">Elige la cuenta…</option>
          {opciones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {sale && c.disponible !== null ? ` · disp. ${fmt.format(c.disponible)}` : ""}
            </option>
          ))}
        </Selector>
      </label>
      <label className="text-xs text-slate-500">
        Monto {SIMBOLO[moneda]}
        <Entrada name="monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className="w-36 text-right" required />
      </label>
      <label className="text-xs text-slate-500">
        Fecha
        <Entrada type="date" name="fecha" defaultValue={hoy} className="w-40" required />
      </label>
      <label className="text-xs text-slate-500">
        Referencia / hash
        <Entrada name="referencia" className="w-40" />
      </label>
      {sale && (
        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
          <input type="checkbox" name="interbancario" checked={marcado} onChange={(e) => setInterbancario(e.target.checked)} />
          Interbancario
        </label>
      )}
      <BotonGuardar texto={sale ? "Reportar enviado" : "Reportar recibido"} />
      {pasa && <span className="w-full text-xs font-medium text-amber-700">Pasa el límite interbancario de hoy de esta cuenta.</span>}
      <Resultado estado={estado} />
    </Formulario>
  );
}

/** Módulo 3: llevar al balance del cliente un pago o una partida sin banco. */
export function FormularioAlBalance({ tipo, id, fecha }: { tipo: "pago" | "partida"; id: number; fecha: string }) {
  const [estado, accion] = useActionState((tipo === "pago" ? pagoAlBalance : partidaAlBalance).bind(null, id), estadoInicial);
  return (
    <Formulario accion={accion} estado={estado} className="flex flex-wrap items-center gap-2">
      <Entrada type="date" name="fecha" defaultValue={fecha} className="w-40" required />
      <BotonGuardar texto="Revisado: llevar al balance" />
      <Resultado estado={estado} />
    </Formulario>
  );
}

const REVERTIR = {
  pago: { accion: revertirPago, texto: "Corregir pago", ayuda: "Borra el pago y sus movimientos (banco y, si ya estaba, el balance del cliente). Luego se reporta bien." },
  balancePago: { accion: revertirBalancePago, texto: "Quitar del balance", ayuda: "Quita este pago de la hoja del cliente. El pago sigue reportado." },
  balancePartida: { accion: revertirBalancePartida, texto: "Quitar del balance", ayuda: "Quita esta partida de la hoja del cliente." },
  aplicacion: { accion: revertirAplicacion, texto: "Revertir aplicación", ayuda: "Borra los movimientos de banco y cliente de esta partida." },
} as const;

/** Corregir: revierte un paso (con motivo, queda en la auditoría). */
export function FormularioRevertir({ tipo, id }: { tipo: keyof typeof REVERTIR; id: number }) {
  const r = REVERTIR[tipo];
  const [estado, accion] = useActionState(r.accion.bind(null, id), estadoInicial);
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-red-700 underline">{r.texto}</summary>
      <Formulario accion={accion} estado={estado} className="mt-2 space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-3">
        <p className="text-slate-600">{r.ayuda}</p>
        <Entrada name="motivo" placeholder="Qué estaba mal" required />
        <Boton type="submit" variante="peligro">
          {r.texto}
        </Boton>
        <Resultado estado={estado} />
      </Formulario>
    </details>
  );
}

export function FormularioCerrarPartida({ partidaId, diferencia }: { partidaId: number; diferencia: string }) {
  const [estado, accion] = useActionState(cerrarPartida.bind(null, partidaId), estadoInicial);
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-slate-600 underline">Cerrar con diferencia</summary>
      <Formulario accion={accion} estado={estado} className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3">
        <p className="text-slate-600">Diferencia: {diferencia}. La partida queda cerrada con lo pagado.</p>
        <Entrada name="nota" placeholder="Motivo (p. ej. el banco cobró comisión)" required />
        <Boton type="submit" variante="secundario">
          Cerrar partida
        </Boton>
        <Resultado estado={estado} />
      </Formulario>
    </details>
  );
}

export function FormularioFirmaCambio({ cambioId, ejecutivo }: { cambioId: number; ejecutivo: string }) {
  const [estado, accion] = useActionState(firmarCambio.bind(null, cambioId), estadoInicial);
  const [valor, setValor] = useState("si");
  return (
    <Formulario accion={accion} estado={estado} className="space-y-2">
      <input type="hidden" name="aprueba" value={valor} />
      <AreaTexto name="comentario" rows={2} placeholder="Comentario (obligatorio si rechazas)" />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" onClick={() => setValor("si")}>
          Aprobar cambio como {ejecutivo}
        </Boton>
        <Boton type="submit" variante="peligro" onClick={() => setValor("no")}>
          Rechazar
        </Boton>
      </div>
      <Resultado estado={estado} />
    </Formulario>
  );
}

export function BotonRetirarCambio({ cambioId }: { cambioId: number }) {
  const [estado, accion] = useActionState(() => retirarCambio(cambioId), estadoInicial);
  return (
    <Formulario accion={accion} estado={estado} className="inline">
      <button type="submit" className="text-xs text-slate-600 underline">
        Retirar la propuesta
      </button>
      <Resultado estado={estado} />
    </Formulario>
  );
}

/** Propuesta de cambio: la operación como quedaría. Se aplica con dos aprobaciones. */
export function FormularioCambio({
  operacionId,
  inicial,
  cuentas,
  fijas,
  esEjecutivo,
}: {
  operacionId: number;
  inicial: { descripcion: string; montoUsd: string; tasa: string; utilidad: string; partidas: PartidaBorrador[] };
  cuentas: CuentaOpcion[];
  fijas: number[];
  esEjecutivo: boolean;
}) {
  const [estado, accion] = useActionState(proponerCambio.bind(null, operacionId), estadoInicial);
  const [lista, setLista] = useState(inicial.partidas);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [montoUsd, setMontoUsd] = useState(inicial.montoUsd);
  const [tasa, setTasa] = useState(inicial.tasa);
  const [utilidad, setUtilidad] = useState(inicial.utilidad);
  const [motivo, setMotivo] = useState("");
  const n = (v: string) => (v.trim() ? leerImporte(v) : null);
  const datos = JSON.stringify({
    motivo,
    descripcion,
    montoUsd: n(montoUsd),
    tasa: n(tasa),
    montoBs: n(montoUsd) !== null && n(tasa) !== null ? Math.round(n(montoUsd)! * n(tasa)! * 100) / 100 : null,
    utilidad: n(utilidad),
    partidas: lista,
  });
  return (
    <Formulario accion={accion} estado={estado} className="space-y-4">
      <input type="hidden" name="datos" value={datos} />
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Monto US$">
          <Entrada inputMode="decimal" value={montoUsd} onChange={(e) => setMontoUsd(e.target.value)} />
        </Campo>
        <Campo etiqueta="Tasa">
          <Entrada inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} />
        </Campo>
        <Campo etiqueta="Utilidad US$">
          <Entrada inputMode="decimal" value={utilidad} onChange={(e) => setUtilidad(e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Descripción">
        <AreaTexto rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </Campo>
      <EditorPartidas lista={lista} cambiar={setLista} cuentas={cuentas} fijas={fijas} />
      <Campo etiqueta="Motivo del cambio" ayuda="Lo ven los ejecutivos que tienen que aprobarlo.">
        <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
      </Campo>
      <div className="flex flex-wrap items-center gap-3">
        <BotonGuardar texto="Proponer cambio" />
        <span className="text-xs text-slate-500">
          Se aplica cuando lo aprueban dos ejecutivos{esEjecutivo ? "; tu firma ya cuenta como una" : ""}.
          {hayDolaresQueSalen(lista) && " Esa aprobación vale también para las transferencias de dólares."}
        </span>
      </div>
    </Formulario>
  );
}

/** Módulo 4: gasto, honorarios, comisión o traspaso entre cuentas propias. */
export function FormularioAdministrativa({ cuentas, hoy }: { cuentas: CuentaOpcion[]; hoy: string }) {
  const [estado, accion] = useActionState(crearAdministrativa, estadoInicial);
  const [tipo, setTipo] = useState("gasto");
  const [moneda, setMoneda] = useState<Moneda>("BS");
  const [datosPago, setDatosPago] = useState(datosPagoVacios());
  const pagoBs = moneda === "BS" && tipo !== "traspaso";
  const deMoneda = cuentas.filter((c) => c.moneda === moneda);
  return (
    <Formulario accion={accion} estado={estado} reiniciarTrasExito className="space-y-4">
      {estado.error && <Aviso>{estado.error}</Aviso>}
      {estado.ok && <Aviso tipo="info">{estado.mensaje}</Aviso>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo etiqueta="Tipo">
          <Selector name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="gasto">Gasto / nómina</option>
            <option value="honorarios">Honorarios</option>
            <option value="comision">Comisión bancaria</option>
            <option value="traspaso">Traspaso entre cuentas propias</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Fecha">
          <Entrada type="date" name="fecha" defaultValue={hoy} required />
        </Campo>
        <Campo etiqueta="Moneda">
          <Selector name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
            {(["BS", "USD", "USDT", "USDC"] as Moneda[]).map((m) => (
              <option key={m} value={m}>
                {SIMBOLO[m]}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Monto">
          <Entrada name="monto" inputMode="decimal" required />
        </Campo>
      </div>
      <Campo etiqueta="Descripción">
        <Entrada name="descripcion" placeholder="Ej.: Nómina octubre, alquiler oficina…" required />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Sale de (opcional)" ayuda="Si no la eliges, la pone la administradora al reportar el pago.">
          <Selector name="cuentaOrigen" defaultValue="">
            <option value="">La elige al pagar</option>
            {deMoneda.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        {tipo === "traspaso" ? (
          <Campo etiqueta="Entra en">
            <Selector name="cuentaDestino" defaultValue="" required>
              <option value="">Elige…</option>
              {deMoneda.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
        ) : pagoBs ? null : (
          <>
            <Campo etiqueta="A quién / a dónde se paga">
              <Entrada name="destino" />
            </Campo>
            <Campo etiqueta="Banco de destino">
              <Entrada name="bancoDestino" />
            </Campo>
          </>
        )}
      </div>
      {pagoBs && (
        <>
          <input type="hidden" name="datosPago" value={JSON.stringify(datosPago)} />
          <CamposPagoBs valor={datosPago} cambiar={setDatosPago} />
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <BotonGuardar texto="Registrar" />
        <span className="text-xs text-slate-500">
          {moneda === "BS" ? "Pasa a Pagos para reportarla." : "Saca dólares: necesita la aprobación de dos ejecutivos antes de enviarse."}
        </span>
      </div>
    </Formulario>
  );
}
