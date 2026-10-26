"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { AreaTexto, Aviso, BotonEnlace, Campo, Casilla, Entrada, Selector, Tarjeta } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { guardarCliente, guardarSubcuenta } from "./actions";

export type OpcionEjecutivo = { id: number; codigo: string; nombre: string };

function SelectorEjecutivo({
  ejecutivos,
  valor,
  vacio,
}: {
  ejecutivos: OpcionEjecutivo[];
  valor?: number | null;
  vacio: string;
}) {
  return (
    <Selector name="ejecutivoId" defaultValue={valor ?? ""}>
      <option value="">{vacio}</option>
      {ejecutivos.map((e) => (
        <option key={e.id} value={e.id}>
          {e.codigo} — {e.nombre}
        </option>
      ))}
    </Selector>
  );
}

type Cliente = {
  id: number;
  nombre: string;
  ejecutivoId: number | null;
  notas: string | null;
  activo: boolean;
};

export function FormularioCliente({
  cliente,
  ejecutivos,
}: {
  cliente?: Cliente;
  ejecutivos: OpcionEjecutivo[];
}) {
  const [estado, accion] = useActionState(
    guardarCliente.bind(null, cliente?.id ?? null),
    estadoInicial,
  );
  return (
    <Tarjeta className="max-w-xl p-6">
      <Formulario accion={accion} estado={estado} className="space-y-4">
        {estado.error && <Aviso>{estado.error}</Aviso>}
        <Campo
          etiqueta="Nombre del cliente"
          error={estado.errores?.nombre}
          ayuda={cliente ? undefined : "Se crea también una subcuenta con este mismo nombre."}
        >
          <Entrada name="nombre" defaultValue={cliente?.nombre} required />
        </Campo>
        <Campo etiqueta="Ejecutivo" error={estado.errores?.ejecutivoId}>
          <SelectorEjecutivo ejecutivos={ejecutivos} valor={cliente?.ejecutivoId} vacio="Sin asignar" />
        </Campo>
        <Campo etiqueta="Notas" error={estado.errores?.notas}>
          <AreaTexto name="notas" rows={3} defaultValue={cliente?.notas ?? ""} />
        </Campo>
        {cliente && <Casilla name="activo" etiqueta="Activo" defaultChecked={cliente.activo} />}
        <div className="flex gap-2 pt-2">
          <BotonGuardar />
          <BotonEnlace href={cliente ? `/clientes/${cliente.id}` : "/clientes"} variante="secundario">
            Cancelar
          </BotonEnlace>
        </div>
      </Formulario>
    </Tarjeta>
  );
}

type Subcuenta = { id: number; nombre: string; ejecutivoId: number | null; activa: boolean };

export function FormularioSubcuenta({
  clienteId,
  subcuenta,
  ejecutivos,
}: {
  clienteId: number;
  subcuenta?: Subcuenta;
  ejecutivos: OpcionEjecutivo[];
}) {
  const [estado, accion] = useActionState(
    guardarSubcuenta.bind(null, clienteId, subcuenta?.id ?? null),
    estadoInicial,
  );
  return (
    <Formulario
      accion={accion}
      estado={estado}
      reiniciarTrasExito={!subcuenta}
      className="grid gap-3 sm:grid-cols-[2fr_1.5fr_auto_auto] sm:items-end">
      <Campo etiqueta="Nombre" error={estado.errores?.nombre}>
        <Entrada name="nombre" defaultValue={subcuenta?.nombre} required placeholder="Cliente - Empresa" />
      </Campo>
      <Campo etiqueta="Ejecutivo">
        <SelectorEjecutivo ejecutivos={ejecutivos} valor={subcuenta?.ejecutivoId} vacio="El del cliente" />
      </Campo>
      {subcuenta ? (
        <div className="pb-2">
          <Casilla name="activa" etiqueta="Activa" defaultChecked={subcuenta.activa} />
        </div>
      ) : (
        <span />
      )}
      <BotonGuardar texto={subcuenta ? "Guardar" : "Añadir"} />
    </Formulario>
  );
}
