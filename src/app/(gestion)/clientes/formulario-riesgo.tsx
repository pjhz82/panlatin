"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Aviso, Campo, Entrada, Selector } from "@/components/ui";
import type { RiesgoCliente } from "@/db/schema";
import { estadoInicial } from "@/lib/formularios";
import { RIESGOS } from "@/lib/riesgo";
import { actualizarRiesgo } from "./riesgo";

export function FormularioRiesgo({
  clienteId,
  riesgo,
  riesgoNota,
  diasCredito,
}: {
  clienteId: number;
  riesgo: RiesgoCliente;
  riesgoNota: string | null;
  diasCredito: number | null;
}) {
  const [estado, accion] = useActionState(actualizarRiesgo.bind(null, clienteId), estadoInicial);
  return (
    <Formulario accion={accion} estado={estado} className="space-y-3">
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Campo etiqueta="Riesgo de cobro" error={estado.errores?.riesgo}>
          <Selector name="riesgo" defaultValue={riesgo}>
            {Object.entries(RIESGOS).map(([v, r]) => (
              <option key={v} value={v}>
                {r.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Plazo de pago (días)" error={estado.errores?.diasCredito} ayuda="Vacío: sin plazo">
          <Entrada name="diasCredito" type="number" min={0} defaultValue={diasCredito ?? ""} />
        </Campo>
      </div>
      <Campo etiqueta="Nota" error={estado.errores?.riesgoNota}>
        <Entrada name="riesgoNota" defaultValue={riesgoNota ?? ""} placeholder="Motivo, acuerdos de pago…" />
      </Campo>
      <div className="flex items-center gap-3">
        <BotonGuardar texto="Guardar riesgo y plazo" />
        {estado.ok && <span className="text-sm text-emerald-700">Guardado.</span>}
      </div>
      <p className="text-xs text-slate-500">
        «Incobrable» resta su deuda del activo en el balance (provisión). «Alta probabilidad de impago» la marca para
        seguimiento.
      </p>
    </Formulario>
  );
}
