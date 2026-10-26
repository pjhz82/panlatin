import { redirect } from "next/navigation";
import { hayUsuarios } from "./actions";
import { FormularioInstalacion } from "./formulario";

export const metadata = { title: "Configuración inicial" };
export const dynamic = "force-dynamic";

export default async function PaginaInstalar() {
  if (await hayUsuarios()) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Panlatin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Configuración inicial</h1>
          <p className="mt-2 text-sm text-slate-500">Crea el primer administrador.</p>
        </div>
        <FormularioInstalacion />
      </div>
    </main>
  );
}
