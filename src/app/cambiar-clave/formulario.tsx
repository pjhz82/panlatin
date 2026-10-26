"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Aviso, Campo, Entrada } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { cambiarClave } from "./actions";

export function FormularioClave() {
  const [estado, accion] = useActionState(cambiarClave, estadoInicial);
  const e = estado.errores ?? {};
  return (
    <Formulario
      accion={accion}
      estado={estado}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <Campo etiqueta="Contraseña actual" error={e.actual}>
        <Entrada name="actual" type="password" autoComplete="current-password" required />
      </Campo>
      <Campo etiqueta="Nueva contraseña" error={e.password} ayuda="Mínimo 12 caracteres.">
        <Entrada name="password" type="password" autoComplete="new-password" required />
      </Campo>
      <Campo etiqueta="Repite la nueva" error={e.repetir}>
        <Entrada name="repetir" type="password" autoComplete="new-password" required />
      </Campo>
      <BotonGuardar texto="Cambiar contraseña" />
    </Formulario>
  );
}
