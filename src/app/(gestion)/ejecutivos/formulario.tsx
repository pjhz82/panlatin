"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Aviso, BotonEnlace, Campo, Casilla, Entrada, Tarjeta } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { guardarEjecutivo } from "./actions";

type Ejecutivo = { id: number; codigo: string; nombre: string; activo: boolean };

export function FormularioEjecutivo({ ejecutivo }: { ejecutivo?: Ejecutivo }) {
  const [estado, accion] = useActionState(
    guardarEjecutivo.bind(null, ejecutivo?.id ?? null),
    estadoInicial,
  );
  return (
    <Tarjeta className="max-w-xl p-6">
      <Formulario accion={accion} estado={estado} className="space-y-4">
        {estado.error && <Aviso>{estado.error}</Aviso>}
        <Campo etiqueta="Código" error={estado.errores?.codigo} ayuda="Como aparece en los Excel: FCLP, PH, JCMDA…">
          <Entrada name="codigo" defaultValue={ejecutivo?.codigo} required className="uppercase" />
        </Campo>
        <Campo etiqueta="Nombre" error={estado.errores?.nombre}>
          <Entrada name="nombre" defaultValue={ejecutivo?.nombre} required />
        </Campo>
        <Casilla name="activo" etiqueta="Activo" defaultChecked={ejecutivo?.activo ?? true} />
        <div className="flex gap-2 pt-2">
          <BotonGuardar />
          <BotonEnlace href="/ejecutivos" variante="secundario">
            Cancelar
          </BotonEnlace>
        </div>
      </Formulario>
    </Tarjeta>
  );
}
