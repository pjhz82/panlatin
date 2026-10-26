import type { Moneda } from "@/db/schema";
import { MONEDAS } from "./etiquetas";

const fmt2 = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCorto = new Intl.NumberFormat("es-VE", { notation: "compact", maximumFractionDigits: 1 });

/** 1.234.567,89 */
export const importe = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : fmt2.format(Number(n));

/** US$ 1.234,56 */
export const conMoneda = (n: number | string | null | undefined, moneda: Moneda = "USD") =>
  `${MONEDAS[moneda]} ${importe(n)}`;

/** 1,2 M */
export const corto = (n: number) => fmtCorto.format(n);

export const fechaCorta = (f: string | Date) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
    typeof f === "string" ? new Date(`${f}T00:00:00Z`) : f,
  );

export const mesCorto = (f: string) =>
  new Intl.DateTimeFormat("es-VE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${f}T00:00:00Z`));
