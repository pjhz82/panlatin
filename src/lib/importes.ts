/** Lee un importe escrito como 1.234,56 o 1234.56 (sin signo de moneda). */
export function leerImporte(v: string): number {
  const t = v.trim().replace(/\s/g, "");
  if (!t) return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}
