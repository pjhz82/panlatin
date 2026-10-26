"use client";

import { useState } from "react";

/*
 * Gráficos en SVG sin dependencias. Colores por rol (ver globals.css):
 * --serie-1 azul, --serie-2 naranja; divergente: --favor (azul) / --cobrar (rojo).
 */

type Punto = { x: string; y: number };
export type Serie = { nombre: string; color: string; puntos: Punto[] };

const ALTO = 220;
const M = { arriba: 12, derecha: 12, abajo: 26, izquierda: 64 };
const fmtEje = new Intl.NumberFormat("es-VE", { notation: "compact", maximumFractionDigits: 1 });
const fmtValor = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMes = new Intl.DateTimeFormat("es-VE", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Formato del eje X. Es un texto (no una función) para poder pasarlo desde el servidor. */
export type FormatoX = "mes" | "texto";
const etiqueta = (formato: FormatoX, x: string) =>
  formato === "mes" ? fmtMes.format(new Date(`${x}T00:00:00Z`)) : x;

function escala(min: number, max: number) {
  if (min === max) return { min: min - 1, max: max + 1, marcas: [min] };
  const rango = max - min;
  const paso = 10 ** Math.floor(Math.log10(rango / 4));
  const salto = [1, 2, 2.5, 5, 10].map((k) => k * paso).find((p) => rango / p <= 5) ?? paso * 10;
  const a = Math.floor(min / salto) * salto;
  const b = Math.ceil(max / salto) * salto;
  const marcas: number[] = [];
  for (let v = a; v <= b + salto / 2; v += salto) marcas.push(Number(v.toFixed(6)));
  return { min: a, max: b, marcas };
}

function Leyenda({ series }: { series: { nombre: string; color: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
      {series.map((s) => (
        <span key={s.nombre} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.nombre}
        </span>
      ))}
    </div>
  );
}

/** Líneas en el tiempo con cruz y tooltip al pasar el ratón. Todas las series comparten unidad. */
export function GraficoLineas({
  series,
  formatoX = "mes",
  ancho = 640,
}: {
  series: Serie[];
  formatoX?: FormatoX;
  ancho?: number;
}) {
  const etiquetaX = (x: string) => etiqueta(formatoX, x);
  const [activo, setActivo] = useState<number | null>(null);
  const xs = series[0]?.puntos.map((p) => p.x) ?? [];
  if (xs.length === 0) return <p className="py-8 text-center text-sm text-slate-500">Sin datos.</p>;
  const valores = series.flatMap((s) => s.puntos.map((p) => p.y));
  const { min, max, marcas } = escala(Math.min(0, ...valores), Math.max(0, ...valores));
  const w = ancho - M.izquierda - M.derecha;
  const h = ALTO - M.arriba - M.abajo;
  const px = (i: number) => M.izquierda + (xs.length === 1 ? w / 2 : (i / (xs.length - 1)) * w);
  const py = (v: number) => M.arriba + h - ((v - min) / (max - min)) * h;
  const cadaN = Math.max(1, Math.ceil(xs.length / 8));

  return (
    <div className="relative">
      <Leyenda series={series} />
      <svg
        viewBox={`0 0 ${ancho} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={series.map((s) => s.nombre).join(", ")}
        onMouseLeave={() => setActivo(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * ancho;
          const i = Math.round(((x - M.izquierda) / w) * (xs.length - 1));
          setActivo(Math.min(xs.length - 1, Math.max(0, i)));
        }}
      >
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.izquierda} x2={ancho - M.derecha} y1={py(m)} y2={py(m)} stroke={m === 0 ? "#94a3b8" : "#e2e8f0"} />
            <text x={M.izquierda - 8} y={py(m) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {fmtEje.format(m)}
            </text>
          </g>
        ))}
        {xs.map((x, i) =>
          i % cadaN === 0 ? (
            <text key={x} x={px(i)} y={ALTO - 6} textAnchor="middle" className="fill-slate-500 text-[11px]">
              {etiquetaX(x)}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <polyline
            key={s.nombre}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            points={s.puntos.map((p, i) => `${px(i)},${py(p.y)}`).join(" ")}
          />
        ))}
        {activo !== null && (
          <g>
            <line x1={px(activo)} x2={px(activo)} y1={M.arriba} y2={M.arriba + h} stroke="#94a3b8" strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.nombre} cx={px(activo)} cy={py(s.puntos[activo].y)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {activo !== null && (
        <div
          className="pointer-events-none absolute top-6 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${(px(activo) / ancho) * 100}%`, transform: px(activo) > ancho / 2 ? "translateX(-105%)" : "translateX(5%)" }}
        >
          <p className="mb-1 font-medium text-slate-900">{etiquetaX(xs[activo])}</p>
          {series.map((s) => (
            <p key={s.nombre} className="flex items-center gap-2 text-slate-600">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {series.length > 1 && <span>{s.nombre}:</span>}
              <span className="tabular-nums text-slate-900">{fmtValor.format(s.puntos[activo].y)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barras verticales agrupadas (p. ej. entradas y salidas por mes). */
export function GraficoBarras({
  categorias,
  series,
  formatoX = "mes",
  ancho = 640,
}: {
  categorias: string[];
  series: { nombre: string; color: string; valores: number[] }[];
  formatoX?: FormatoX;
  ancho?: number;
}) {
  const etiquetaX = (x: string) => etiqueta(formatoX, x);
  const [activo, setActivo] = useState<number | null>(null);
  if (categorias.length === 0) return <p className="py-8 text-center text-sm text-slate-500">Sin datos.</p>;
  const { min, max, marcas } = escala(0, Math.max(0, ...series.flatMap((s) => s.valores)));
  const w = ancho - M.izquierda - M.derecha;
  const h = ALTO - M.arriba - M.abajo;
  const banda = w / categorias.length;
  const grosor = Math.max(3, Math.min(18, (banda - 6) / series.length - 2));
  const py = (v: number) => M.arriba + h - ((v - min) / (max - min)) * h;
  const cadaN = Math.max(1, Math.ceil(categorias.length / 8));

  return (
    <div className="relative">
      <Leyenda series={series} />
      <svg viewBox={`0 0 ${ancho} ${ALTO}`} className="h-auto w-full" role="img" onMouseLeave={() => setActivo(null)}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.izquierda} x2={ancho - M.derecha} y1={py(m)} y2={py(m)} stroke={m === 0 ? "#94a3b8" : "#e2e8f0"} />
            <text x={M.izquierda - 8} y={py(m) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {fmtEje.format(m)}
            </text>
          </g>
        ))}
        {categorias.map((c, i) => {
          const x0 = M.izquierda + i * banda + (banda - series.length * (grosor + 2)) / 2;
          return (
            <g key={c} onMouseEnter={() => setActivo(i)}>
              <rect x={M.izquierda + i * banda} y={M.arriba} width={banda} height={h} fill={activo === i ? "#f1f5f9" : "transparent"} />
              {series.map((s, j) => {
                const v = s.valores[i] ?? 0;
                const alto = Math.max(0, py(0) - py(v));
                return (
                  <path
                    key={s.nombre}
                    d={barraRedondeada(x0 + j * (grosor + 2), py(v), grosor, alto)}
                    fill={s.color}
                  />
                );
              })}
              {i % cadaN === 0 && (
                <text x={M.izquierda + i * banda + banda / 2} y={ALTO - 6} textAnchor="middle" className="fill-slate-500 text-[11px]">
                  {etiquetaX(c)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {activo !== null && (
        <div
          className="pointer-events-none absolute top-6 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{
            left: `${((M.izquierda + (activo + 0.5) * banda) / ancho) * 100}%`,
            transform: activo > categorias.length / 2 ? "translateX(-105%)" : "translateX(5%)",
          }}
        >
          <p className="mb-1 font-medium text-slate-900">{etiquetaX(categorias[activo])}</p>
          {series.map((s) => (
            <p key={s.nombre} className="flex items-center gap-2 text-slate-600">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {s.nombre}: <span className="tabular-nums text-slate-900">{fmtValor.format(s.valores[activo] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rectángulo con las esquinas superiores redondeadas (4px) y base recta. */
function barraRedondeada(x: number, y: number, ancho: number, alto: number) {
  const r = Math.min(4, ancho / 2, alto);
  return `M${x},${y + alto} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y + alto} Z`;
}

/** Barras horizontales divergentes: a la derecha a favor del cliente, a la izquierda por cobrar. */
export function BarrasDivergentes({
  filas,
}: {
  filas: { etiqueta: string; valor: number; href?: string }[];
}) {
  const maximo = Math.max(1, ...filas.map((f) => Math.abs(f.valor)));
  return (
    <div className="space-y-1.5">
      {filas.map((f) => {
        const pct = (Math.abs(f.valor) / maximo) * 50;
        const positivo = f.valor >= 0;
        const contenido = (
          <div className="group grid grid-cols-[minmax(0,10rem)_1fr_7rem] items-center gap-3 text-xs" title={`${f.etiqueta}: ${fmtValor.format(f.valor)}`}>
            <span className="truncate text-slate-700 group-hover:text-slate-900">{f.etiqueta}</span>
            <span className="relative h-4">
              <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
              <span
                className="absolute inset-y-0.5 rounded"
                style={{
                  background: positivo ? "var(--favor)" : "var(--cobrar)",
                  left: positivo ? "50%" : `${50 - pct}%`,
                  width: `${pct}%`,
                }}
              />
            </span>
            <span className="text-right tabular-nums text-slate-700">{fmtValor.format(f.valor)}</span>
          </div>
        );
        return f.href ? (
          <a key={f.etiqueta} href={f.href} className="block rounded hover:bg-slate-50">
            {contenido}
          </a>
        ) : (
          <div key={f.etiqueta}>{contenido}</div>
        );
      })}
    </div>
  );
}
