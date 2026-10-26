import type { ReactNode } from "react";
import { salir } from "@/app/login/actions";
import type { UsuarioActual } from "@/lib/auth";
import { ROLES } from "@/lib/etiquetas";
import { Navegacion, type EnlaceNav } from "./navegacion";

/** Estructura común: barra lateral con navegación y usuario, y contenido. */
export function Marco({
  usuario,
  enlaces,
  children,
}: {
  usuario: UsuarioActual;
  enlaces: EnlaceNav[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-slate-900 px-4 py-4 text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:py-6">
        <div className="mb-4 px-3 md:mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Panlatin</p>
          <p className="text-lg font-semibold">Tesorería</p>
        </div>
        <Navegacion enlaces={enlaces} />
        <div className="mt-4 border-t border-slate-800 px-3 pt-4 md:mt-auto">
          <p className="truncate text-sm font-medium">{usuario.nombre}</p>
          <p className="text-xs text-slate-400">{ROLES[usuario.rol]}</p>
          <div className="mt-3 flex gap-3 text-xs text-slate-400">
            <a href="/cambiar-clave" className="underline hover:text-white">
              Contraseña
            </a>
            <form action={salir}>
              <button type="submit" className="underline hover:text-white">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
