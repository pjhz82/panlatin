import { z } from "zod";
import { moneda } from "@/db/schema";
import { bancoPorCodigo, erroresDatosPagoBs, soloDigitos } from "./bancos-ve";

const numero = z.number().finite();
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const esquemaDatosPago = z.object({
  metodo: z.enum(["transferencia", "pago_movil"]),
  titular: z.string().trim().max(120),
  documento: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v.replace(/[.\s]/g, "").toUpperCase().replace(/^([VEJGP])(\d)/, "$1-$2")),
  banco: z.string().trim().max(4),
  cuenta: z.string().optional().transform((v) => (v ? soloDigitos(v) : undefined)),
  telefono: z.string().optional().transform((v) => (v ? soloDigitos(v).replace(/^(\d{4})(\d{7})$/, "$1-$2") : undefined)),
});

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
    datosPago: esquemaDatosPago.nullable().optional(),
  })
  .transform((p) => {
    const sinBanco = p.importeCuenta === 0;
    const pagoBs = !sinBanco && p.moneda === "BS" && p.importeCuenta < 0;
    if (!pagoBs || !p.datosPago) return { ...p, moneda: sinBanco ? null : p.moneda, datosPago: null };
    // En los pagos en Bs. el destino y el banco salen de los datos del beneficiario.
    const d = p.datosPago;
    const banco = bancoPorCodigo(d.banco);
    return {
      ...p,
      destino: [d.titular, d.documento, d.metodo === "pago_movil" ? `pago móvil ${d.telefono}` : `cta. ${d.cuenta}`].join(" · "),
      bancoDestino: banco?.nombre ?? p.bancoDestino,
      datosPago: d,
    };
  });

export type PartidaEntrada = z.infer<typeof esquemaPartida>;

export const esquemaPartidas = z
  .array(esquemaPartida)
  .min(1, "Añade al menos una partida.")
  .superRefine((lista, ctx) => {
    lista.forEach((p, i) => {
      if (p.importeCuenta !== 0 && !p.moneda) {
        ctx.addIssue({ code: "custom", message: `Partida ${i + 1}: elige la moneda del pago o cobro.` });
      }
      if (p.moneda === "BS" && p.importeCuenta < 0) {
        const errores = erroresDatosPagoBs(p.datosPago);
        if (errores.length) ctx.addIssue({ code: "custom", message: `Partida ${i + 1} (pago en Bs.): ${errores.join(", ")}.` });
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
