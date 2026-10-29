import type { EstadoOperacion } from "@/db/schema";
import type { PartidaConAvance } from "./pagos";

/** Lo que ve el cliente de una operación: lo que nos paga y lo que le enviamos. */
export function avanceParaCliente(estado: EstadoOperacion, partidas: PartidaConAvance[]) {
  const suyas = partidas.filter((p) => p.avance.ladoCliente);
  const conBanco = suyas.filter((p) => p.avance.ladoBanco);
  const media = (xs: PartidaConAvance[]) => (xs.length ? xs.reduce((t, p) => t + p.avance.pct, 0) / xs.length : null);
  return {
    partidas: suyas,
    /** Lo que el cliente nos paga (cobros). */
    recibido: media(conBanco.filter((p) => p.importe > 0)),
    /** Lo que le enviamos o pagamos por su cuenta. */
    enviado: media(conBanco.filter((p) => p.importe < 0)),
    estado:
      estado === "completada"
        ? ({ texto: "Completada", color: "verde" } as const)
        : estado === "pendiente_firmas"
          ? ({ texto: "En revisión", color: "ambar" } as const)
          : ({ texto: "En proceso", color: "azul" } as const),
  };
}

/** Nombre de la operación para el cliente (desde su punto de vista). */
export const NOMBRE_PARA_CLIENTE: Record<string, string> = {
  compra: "Nos vendes US$",
  venta: "Nos compras US$",
  swap: "Cambio / bancarización",
  prestamo: "Préstamo",
  cobro: "Pago tuyo",
  pago: "Pago a ti o por tu cuenta",
};
