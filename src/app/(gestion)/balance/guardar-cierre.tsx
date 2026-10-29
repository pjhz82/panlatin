"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Entrada } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { guardarCierre } from "../cierres/actions";

/** Guarda el balance mostrado como cierre de ese día. */
export function GuardarCierre({ corte, tasa, existe }: { corte: string; tasa: string; existe: string | null }) {
  const [estado, accion] = useActionState(guardarCierre, estadoInicial);
  return (
    <Formulario accion={accion} estado={estado} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <input type="hidden" name="corte" value={corte} />
      <input type="hidden" name="tasa" value={tasa} />
      <Entrada name="notas" placeholder="Nota del cierre (opcional)" className="w-64" />
      <BotonGuardar texto={existe ? "Reemplazar cierre de este día" : "Guardar cierre de este día"} />
      <span className="text-xs text-slate-500">
        {existe ? `Ya hay un cierre: ${existe}.` : "Guarda una foto del balance con la tasa escrita arriba."}
      </span>
      {estado.error && <span className="w-full text-sm text-red-700">{estado.error}</span>}
      {estado.ok && <span className="w-full text-sm text-emerald-700">Cierre guardado. Puedes verlo en «Cierres diarios».</span>}
    </Formulario>
  );
}
