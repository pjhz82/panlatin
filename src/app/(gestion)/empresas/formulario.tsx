"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Aviso, BotonEnlace, Campo, Casilla, Entrada, Tarjeta } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { guardarEmpresa } from "./actions";

type Empresa = { id: number; nombre: string; pais: string | null; activa: boolean };

export function FormularioEmpresa({ empresa }: { empresa?: Empresa }) {
  const [estado, accion] = useActionState(
    guardarEmpresa.bind(null, empresa?.id ?? null),
    estadoInicial,
  );
  return (
    <Tarjeta className="max-w-xl p-6">
      <Formulario accion={accion} estado={estado} className="space-y-4">
        {estado.error && <Aviso>{estado.error}</Aviso>}
        <Campo etiqueta="Nombre" error={estado.errores?.nombre}>
          <Entrada name="nombre" defaultValue={empresa?.nombre} required />
        </Campo>
        <Campo etiqueta="País" error={estado.errores?.pais}>
          <Entrada name="pais" defaultValue={empresa?.pais ?? ""} placeholder="Venezuela, Panamá, USA…" />
        </Campo>
        <Casilla name="activa" etiqueta="Activa" defaultChecked={empresa?.activa ?? true} />
        <div className="flex gap-2 pt-2">
          <BotonGuardar />
          <BotonEnlace href="/empresas" variante="secundario">
            Cancelar
          </BotonEnlace>
        </div>
      </Formulario>
    </Tarjeta>
  );
}
