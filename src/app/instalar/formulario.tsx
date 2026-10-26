"use client";

import { useActionState } from "react";
import { BotonGuardar, Formulario } from "@/components/formulario";
import { Aviso, Campo, Entrada } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { instalar } from "./actions";

export function FormularioInstalacion() {
  const [estado, accion] = useActionState(instalar, estadoInicial);
  const e = estado.errores ?? {};
  return (
    <Formulario
      accion={accion}
      estado={estado}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <Campo etiqueta="Clave de instalación" error={e.token}>
        <Entrada name="token" type="password" required autoComplete="off" />
      </Campo>
      <Campo etiqueta="Tu nombre" error={e.nombre}>
        <Entrada name="nombre" required />
      </Campo>
      <Campo etiqueta="Usuario" error={e.usuario} ayuda="Con él entrarás a la web.">
        <Entrada name="usuario" required autoComplete="username" autoCapitalize="none" />
      </Campo>
      <Campo etiqueta="Correo (opcional)" error={e.email}>
        <Entrada name="email" type="email" />
      </Campo>
      <Campo etiqueta="Contraseña" error={e.password} ayuda="Mínimo 12 caracteres.">
        <Entrada name="password" type="password" required autoComplete="new-password" />
      </Campo>
      <BotonGuardar texto="Crear administrador" />
    </Formulario>
  );
}
