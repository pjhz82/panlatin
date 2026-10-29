import { z } from "zod";
import { moneda } from "@/db/schema";

const numero = z.number().finite();
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

/** Una partida tal como llega de los formularios (instrucción o cambio). */
export const esquemaPartida = z
  .object({
    id: z.number().int().positive().optional(),
    descripcion: z.string().trim().min(1, "Cada partida necesita una descripción."),
    cuentaId: z.number().int().positive().nullable(),
    moneda: z.enum(moneda.enumValues).nullable(),
    importeCuenta: numero,
    efectoCliente: numero,
    destino: textoOpcional(300),
    bancoDestino: textoOpcional(100),
  })
  .transform((p) => (p.importeCuenta === 0 ? { ...p, moneda: null } : p));

export type PartidaEntrada = z.infer<typeof esquemaPartida>;

export const esquemaPartidas = z
  .array(esquemaPartida)
  .min(1, "Añade al menos una partida.")
  .superRefine((lista, ctx) => {
    lista.forEach((p, i) => {
      if (p.importeCuenta !== 0 && !p.moneda) {
        ctx.addIssue({ code: "custom", message: `Partida ${i + 1}: elige la moneda del pago o cobro.` });
      }
      if (p.importeCuenta === 0 && p.efectoCliente === 0) {
        ctx.addIssue({ code: "custom", message: `Partida ${i + 1}: no mueve nada (importes a cero).` });
      }
    });
  });

/** Datos generales que se pueden cambiar de una operación. */
export const esquemaGenerales = z.object({
  descripcion: z.string().trim().max(500).optional(),
  montoUsd: numero.nonnegative().nullable(),
  tasa: numero.nonnegative().nullable(),
  montoBs: numero.nullable(),
  utilidad: numero.nullable(),
});

export const esquemaCambio = esquemaGenerales.extend({
  motivo: z.string().trim().min(3, "Explica el motivo del cambio.").max(500),
  partidas: esquemaPartidas,
});
export type PropuestaCambio = z.infer<typeof esquemaCambio>;
