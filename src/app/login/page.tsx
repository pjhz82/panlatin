"use client";

import { useActionState } from "react";
import { Formulario } from "@/components/formulario";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui";
import { estadoInicial } from "@/lib/formularios";
import { entrar } from "./actions";

export default function PaginaLogin() {
  const [estado, accion, pendiente] = useActionState(entrar, estadoInicial);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Panlatin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Tesorería</h1>
        </div>
        <Formulario
          accion={accion}
          estado={estado}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {estado.error && <Aviso>{estado.error}</Aviso>}
          <Campo etiqueta="Correo">
            <Entrada name="email" type="email" autoComplete="username" required autoFocus />
          </Campo>
          <Campo etiqueta="Contraseña">
            <Entrada name="password" type="password" autoComplete="current-password" required />
          </Campo>
          <Boton type="submit" disabled={pendiente} className="w-full">
            {pendiente ? "Entrando…" : "Entrar"}
          </Boton>
        </Formulario>
      </div>
    </main>
  );
}
