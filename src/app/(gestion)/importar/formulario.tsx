"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Aviso, Campo, Entrada, Tarjeta } from "@/components/ui";
import { importar, type EstadoImportacion } from "./actions";

const inicial: EstadoImportacion = {};

export function FormularioImportacion() {
  const [estado, accion] = useActionState(importar, inicial);
  const r = estado.resultado;
  return (
    <Tarjeta className="max-w-xl p-6">
      <Formulario accion={accion} className="space-y-4">
        {estado.error && <Aviso>{estado.error}</Aviso>}
        {r && (
          <Aviso tipo="info">
            Importación terminada. Nuevos: {r.empresas} empresas, {r.ejecutivos} ejecutivos, {r.clientes} clientes,{" "}
            {r.subcuentas} subcuentas, {r.cuentas} cuentas y {r.usuarios} usuarios. Movimientos cargados:{" "}
            {r.movimientos.toLocaleString("es")} · operaciones históricas: {r.operaciones.toLocaleString("es")}.
          </Aviso>
        )}
        <Campo etiqueta="Archivo de datos (.json)" ayuda="Puede tardar unos segundos con muchos movimientos.">
          <Entrada name="archivo" type="file" accept=".json,application/json" required />
        </Campo>
        <BotonGuardar texto="Importar" />
      </Formulario>
    </Tarjeta>
  );
}
