/** Barra de avance (0–1) con su porcentaje. */
export function BarraAvance({ pct, etiqueta, className = "" }: { pct: number; etiqueta?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, pct));
  const color = v >= 0.995 ? "bg-emerald-500" : v > 0 ? "bg-sky-500" : "bg-slate-300";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${color}`} style={{ width: `${v * 100}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums text-slate-600">{etiqueta ?? `${Math.round(v * 100)} %`}</span>
    </div>
  );
}
