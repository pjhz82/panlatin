"use client";

import { useState } from "react";
import { Entrada, Selector } from "@/components/ui";
import { BANCOS_VE, bancoPorCodigo, erroresDatosPagoBs, soloDigitos, textoDatosPagoBs, type DatosPagoBs } from "@/lib/bancos-ve";

/** Datos del beneficiario de un pago en Bs.: transferencia o pago móvil. */
export function CamposPagoBs({ valor, cambiar }: { valor: DatosPagoBs; cambiar: (d: DatosPagoBs) => void }) {
  const set = (c: Partial<DatosPagoBs>) => cambiar({ ...valor, ...c });
  const errores = erroresDatosPagoBs(valor);
  const tocado = Boolean(valor.titular || valor.documento || valor.cuenta || valor.telefono);
  return (
    <div className="rounded-lg bg-amber-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700">
        <span>Datos para pagar en Bs.</span>
        {(["transferencia", "pago_movil"] as const).map((m) => (
          <label key={m} className="flex items-center gap-1.5">
            <input type="radio" checked={valor.metodo === m} onChange={() => set({ metodo: m })} />
            {m === "transferencia" ? "Transferencia" : "Pago móvil"}
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_9rem_minmax(0,1.4fr)_minmax(0,1.6fr)]">
        <label className="text-xs text-slate-500">
          Titular
          <Entrada value={valor.titular} onChange={(e) => set({ titular: e.target.value })} placeholder="Nombre o razón social" />
        </label>
        <label className="text-xs text-slate-500">
          Cédula / RIF
          <Entrada value={valor.documento} onChange={(e) => set({ documento: e.target.value })} placeholder="V-12345678" />
        </label>
        <label className="text-xs text-slate-500">
          Banco
          <Selector value={valor.banco} onChange={(e) => set({ banco: e.target.value })}>
            <option value="">Elige…</option>
            {BANCOS_VE.map((b) => (
              <option key={b.codigo} value={b.codigo}>
                {b.codigo} · {b.nombre}
              </option>
            ))}
          </Selector>
        </label>
        {valor.metodo === "transferencia" ? (
          <label className="text-xs text-slate-500">
            Nº de cuenta (20 dígitos)
            <Entrada
              value={valor.cuenta ?? ""}
              inputMode="numeric"
              onChange={(e) => {
                const cuenta = e.target.value;
                const codigo = soloDigitos(cuenta).slice(0, 4);
                // Los 4 primeros dígitos dicen el banco.
                set({ cuenta, ...(codigo.length === 4 && bancoPorCodigo(codigo) ? { banco: codigo } : {}) });
              }}
              placeholder="0134…"
              className="font-mono"
            />
          </label>
        ) : (
          <label className="text-xs text-slate-500">
            Teléfono
            <Entrada value={valor.telefono ?? ""} inputMode="tel" onChange={(e) => set({ telefono: e.target.value })} placeholder="0414-1234567" />
          </label>
        )}
      </div>
      {tocado && errores.length > 0 && <p className="mt-1 text-xs text-red-700">Falta: {errores.join(", ")}.</p>}
    </div>
  );
}

/** Datos del beneficiario para quien hace el pago, con botón para copiarlos. */
export function VerDatosPagoBs({ datos }: { datos: DatosPagoBs }) {
  const [copiado, setCopiado] = useState(false);
  const texto = textoDatosPagoBs(datos);
  return (
    <div className="mt-2 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
      <pre className="whitespace-pre-wrap font-sans text-slate-700">{texto}</pre>
      <button
        type="button"
        className="text-xs text-slate-600 underline"
        onClick={() => {
          navigator.clipboard?.writeText(texto).then(
            () => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            },
            () => setCopiado(false),
          );
        }}
      >
        {copiado ? "Copiado" : "Copiar datos"}
      </button>
    </div>
  );
}
