import type { RiesgoCliente } from "@/db/schema";

export const RIESGOS: Record<RiesgoCliente, { nombre: string; color: "gris" | "ambar" | "rojo" | "verde" }> = {
  normal: { nombre: "Normal", color: "verde" },
  alto_riesgo: { nombre: "Alta probabilidad de impago", color: "ambar" },
  incobrable: { nombre: "Incobrable", color: "rojo" },
};

/** Tramos de antigüedad según los días vencidos. */
export const TRAMOS = [
  { clave: "al_dia", nombre: "Al día", hasta: 0 },
  { clave: "1_30", nombre: "1–30 días", hasta: 30 },
  { clave: "31_60", nombre: "31–60 días", hasta: 60 },
  { clave: "61_90", nombre: "61–90 días", hasta: 90 },
  { clave: "90", nombre: "Más de 90 días", hasta: Infinity },
] as const;

export const tramoDe = (diasVencido: number) => TRAMOS.find((t) => diasVencido <= t.hasta)!;
