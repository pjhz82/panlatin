import { redirect } from "next/navigation";
import { obtenerUsuario } from "@/lib/auth";
import { FormularioClave } from "./formulario";

export const metadata = { title: "Cambiar contraseña" };

export default async function PaginaCambiarClave() {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Panlatin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Cambiar contraseña</h1>
          <p className="mt-2 text-sm text-slate-500">
            {usuario.debeCambiarPassword
              ? `Hola, ${usuario.nombre}. Tu contraseña es temporal: elige una nueva para continuar.`
              : usuario.nombre}
          </p>
        </div>
        <FormularioClave />
      </div>
    </main>
  );
}
