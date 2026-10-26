import type { ReactNode } from "react";
import { Tarjeta } from "./ui";

export function Indicador({
  titulo,
  valor,
  detalle,
  tono = "normal",
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: "normal" | "favor" | "cobrar";
}) {
  const color = tono === "favor" ? "text-sky-700" : tono === "cobrar" ? "text-red-700" : "text-slate-900";
  return (
    <Tarjeta className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
    </Tarjeta>
  );
}

export function Seccion({ titulo, children, acciones }: { titulo: string; children: ReactNode; acciones?: ReactNode }) {
  return (
    <Tarjeta className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </Tarjeta>
  );
}
