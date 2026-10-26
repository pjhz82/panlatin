"use client";

import { createContext, useContext, useEffect, useRef, useTransition, type ReactNode } from "react";
import type { EstadoFormulario } from "@/lib/formularios";
import { Boton } from "./ui";

const Enviando = createContext(false);

/**
 * Formulario que envía con una Server Action sin el reinicio automático de
 * React: si la acción devuelve errores, lo escrito se conserva.
 * Con `reiniciarTrasExito`, se vacía cuando la acción devuelve { ok: true }.
 */
export function Formulario({
  accion,
  estado,
  reiniciarTrasExito = false,
  className,
  children,
}: {
  accion: (datos: FormData) => void;
  estado?: EstadoFormulario;
  reiniciarTrasExito?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [enviando, iniciar] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (reiniciarTrasExito && estado?.ok) ref.current?.reset();
  }, [estado, reiniciarTrasExito]);

  return (
    <Enviando.Provider value={enviando}>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          const datos = new FormData(e.currentTarget);
          iniciar(() => accion(datos));
        }}
      >
        {children}
      </form>
    </Enviando.Provider>
  );
}

export function BotonGuardar({ texto = "Guardar" }: { texto?: string }) {
  const enviando = useContext(Enviando);
  return (
    <Boton type="submit" disabled={enviando}>
      {enviando ? "Guardando…" : texto}
    </Boton>
  );
}
