import { Entrada } from "./ui";

/** Formulario GET que descarga el estado de cuenta en PDF, con periodo opcional. */
export function DescargarPdf({ ruta }: { ruta: string }) {
  return (
    <form action={ruta} method="get" className="flex flex-wrap items-end gap-2 print:hidden">
      <label className="text-xs text-slate-500">
        Desde
        <Entrada type="date" name="desde" className="mt-1 w-40" />
      </label>
      <label className="text-xs text-slate-500">
        Hasta
        <Entrada type="date" name="hasta" className="mt-1 w-40" />
      </label>
      <button
        type="submit"
        className="inline-flex items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Descargar PDF
      </button>
    </form>
  );
}
