import type { ComprobanteInfo } from "@/lib/comprobantes";

/** Enlaces a los comprobantes de un pago (se abren en otra pestaña). `base` es la ruta que los sirve. */
export function ListaComprobantes({ lista, base }: { lista: ComprobanteInfo[]; base: string }) {
  if (!lista.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {lista.map((c) => (
        <a key={c.id} href={`${base}/${c.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-700 underline">
          {c.tipo === "application/pdf" ? "Comprobante PDF" : "Comprobante"} · {c.nombre}
        </a>
      ))}
    </span>
  );
}
