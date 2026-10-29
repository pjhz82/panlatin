"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Entrada } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { calcularCierresPasados } from "./actions";

export function FormularioCalcular({ desde, hasta }: { desde: string; hasta: string }) {
  const [estado, accion] = useActionState(calcularCierresPasados, estadoInicial);
  return (
    <Formulario accion={accion} estado={estado} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Desde
          <Entrada type="date" name="desde" defaultValue={desde} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-slate-500">
          Hasta
          <Entrada type="date" name="hasta" defaultValue={hasta} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-slate-500">
          Tasa Bs./US$ para todos
          <Entrada name="tasa" inputMode="decimal" placeholder="1013,03" className="mt-1 w-36" required />
        </label>
        <BotonGuardar texto="Calcular cierres" />
      </div>
      {estado.error && <p className="text-sm text-red-700">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-emerald-700">Cierres calculados.</p>}
      <p className="text-xs text-slate-500">
        Calcula el balance de cada día con los movimientos registrados. No toca los cierres guardados a mano.
      </p>
    </Formulario>
  );
}
