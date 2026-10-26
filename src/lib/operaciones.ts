import type { EstadoOperacion, Moneda, TipoOperacion } from "@/db/schema";

/*
 * Plantillas de operación: a partir de los datos generales proponen las
 * partidas (pagos y cobros). Se usan en el formulario (navegador) y no tocan
 * la base de datos.
 *
 * Signos, igual que en los estados de cuenta de los Excel:
 * - importe de cuenta: + entra en la cuenta, − sale.
 * - efecto en el cliente (US$): + abono (a su favor), − cargo.
 * Compra: al pagar los Bs. se le carga el monto; al recibir sus US$ se le abona.
 * Venta: al cobrar sus Bs. se le abona; al entregarle los US$ se le carga.
 */

export const TIPOS_OPERACION: Record<TipoOperacion, { nombre: string; ayuda: string }> = {
  compra: { nombre: "Compra de US$", ayuda: "El cliente nos da US$ y le pagamos en Bs." },
  venta: { nombre: "Venta de US$", ayuda: "El cliente nos paga en Bs. y le damos US$." },
  swap: { nombre: "Bancarización / Swap", ayuda: "Cambio entre efectivo, banco o USDT cobrando un %." },
  liquidacion_usdt: { nombre: "Liquidación USDT", ayuda: "Pasar USDT de una wallet a US$ en banco." },
  traspaso: { nombre: "Traspaso entre cuentas", ayuda: "Mover fondos entre cuentas propias." },
  prestamo: { nombre: "Préstamo", ayuda: "Entregamos dinero al cliente; queda por cobrar." },
  cobro: { nombre: "Cobro", ayuda: "El cliente nos paga (abono en su cuenta)." },
  pago: { nombre: "Pago", ayuda: "Pagamos al cliente o por su cuenta (cargo en su cuenta)." },
  honorarios: { nombre: "Honorarios", ayuda: "Pago de honorarios." },
  comision: { nombre: "Comisión", ayuda: "Comisión cobrada o pagada." },
  gasto: { nombre: "Gasto", ayuda: "Gasto de la empresa, sin cliente." },
};

export const ESTADOS_OPERACION: Record<EstadoOperacion, { nombre: string; color: "gris" | "ambar" | "azul" | "verde" | "rojo" }> = {
  pendiente_firmas: { nombre: "Pendiente de firmas", color: "ambar" },
  aprobada: { nombre: "Aprobada", color: "azul" },
  en_ejecucion: { nombre: "En ejecución", color: "azul" },
  completada: { nombre: "Completada", color: "verde" },
  rechazada: { nombre: "Rechazada", color: "rojo" },
  anulada: { nombre: "Anulada", color: "gris" },
};

export const FIRMAS_REQUERIDAS = 2;

/** Tipos que necesitan cliente. */
export const CON_CLIENTE: TipoOperacion[] = ["compra", "venta", "swap", "prestamo", "cobro", "pago"];

export type DatosGenerales = {
  tipo: TipoOperacion;
  montoUsd: number;
  tasa: number;
  /** % de comisión bancaria sobre los Bs. */
  comisionBancoPct: number;
  /** % que se cobra al cliente (comisión de la operación o del swap). */
  comisionClientePct: number;
  /** % de coste por liquidar USDT. */
  costeLiquidacionPct: number;
  cuentaBs: number | null;
  cuentaUsd: number | null;
  cuentaOrigen: number | null;
  cuentaDestino: number | null;
};

export type PartidaBorrador = {
  descripcion: string;
  cuentaId: number | null;
  importeCuenta: number;
  efectoCliente: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Partidas propuestas para los datos generales. */
export function proponerPartidas(d: DatosGenerales, monedaDe: (cuentaId: number | null) => Moneda | null): PartidaBorrador[] {
  const M = d.montoUsd || 0;
  const B = r2(M * (d.tasa || 0));
  const comCliente = r2((M * d.comisionClientePct) / 100);
  const enMonedaDe = (cuentaId: number | null, usd: number) => (monedaDe(cuentaId) === "BS" ? r2(usd * (d.tasa || 0)) : r2(usd));
  const p: PartidaBorrador[] = [];
  const comisionCliente = () => {
    if (comCliente > 0) p.push({ descripcion: "Comisión cobrada al cliente", cuentaId: null, importeCuenta: 0, efectoCliente: -comCliente });
  };

  switch (d.tipo) {
    case "compra":
      p.push({ descripcion: "Pago en Bs. por cuenta del cliente", cuentaId: d.cuentaBs, importeCuenta: -B, efectoCliente: -M });
      if (d.comisionBancoPct > 0)
        p.push({ descripcion: "Comisión bancaria", cuentaId: d.cuentaBs, importeCuenta: -r2((B * d.comisionBancoPct) / 100), efectoCliente: 0 });
      p.push({ descripcion: "Recibimos los US$ del cliente", cuentaId: d.cuentaUsd, importeCuenta: M, efectoCliente: M });
      comisionCliente();
      break;
    case "venta":
      p.push({ descripcion: "Cobro en Bs. del cliente", cuentaId: d.cuentaBs, importeCuenta: B, efectoCliente: M });
      p.push({ descripcion: "Entregamos los US$ al cliente", cuentaId: d.cuentaUsd, importeCuenta: -M, efectoCliente: -M });
      if (d.costeLiquidacionPct > 0)
        p.push({ descripcion: "Coste de liquidación", cuentaId: d.cuentaUsd, importeCuenta: -r2((M * d.costeLiquidacionPct) / 100), efectoCliente: 0 });
      comisionCliente();
      break;
    case "swap": {
      const entregado = r2(M - comCliente);
      p.push({ descripcion: "Recibimos del cliente", cuentaId: d.cuentaOrigen, importeCuenta: enMonedaDe(d.cuentaOrigen, M), efectoCliente: M });
      p.push({ descripcion: "Entregamos al cliente", cuentaId: d.cuentaDestino, importeCuenta: -enMonedaDe(d.cuentaDestino, entregado), efectoCliente: -entregado });
      if (comCliente > 0) p.push({ descripcion: "Comisión del swap", cuentaId: null, importeCuenta: 0, efectoCliente: -comCliente });
      break;
    }
    case "liquidacion_usdt": {
      const neto = r2(M * (1 - d.costeLiquidacionPct / 100));
      p.push({ descripcion: "Sale de la wallet", cuentaId: d.cuentaOrigen, importeCuenta: -M, efectoCliente: 0 });
      p.push({ descripcion: "Entra en la cuenta", cuentaId: d.cuentaDestino, importeCuenta: enMonedaDe(d.cuentaDestino, neto), efectoCliente: 0 });
      break;
    }
    case "traspaso":
      p.push({ descripcion: "Sale de la cuenta de origen", cuentaId: d.cuentaOrigen, importeCuenta: -enMonedaDe(d.cuentaOrigen, M), efectoCliente: 0 });
      p.push({ descripcion: "Entra en la cuenta de destino", cuentaId: d.cuentaDestino, importeCuenta: enMonedaDe(d.cuentaDestino, M), efectoCliente: 0 });
      break;
    case "prestamo":
      p.push({ descripcion: "Entregamos el préstamo", cuentaId: d.cuentaOrigen, importeCuenta: -enMonedaDe(d.cuentaOrigen, M), efectoCliente: -M });
      break;
    case "cobro":
      p.push({ descripcion: "Cobro al cliente", cuentaId: d.cuentaDestino, importeCuenta: enMonedaDe(d.cuentaDestino, M), efectoCliente: M });
      break;
    case "pago":
      p.push({ descripcion: "Pago al cliente o por su cuenta", cuentaId: d.cuentaOrigen, importeCuenta: -enMonedaDe(d.cuentaOrigen, M), efectoCliente: -M });
      break;
    case "honorarios":
    case "comision":
    case "gasto":
      p.push({ descripcion: TIPOS_OPERACION[d.tipo].nombre, cuentaId: d.cuentaOrigen, importeCuenta: -enMonedaDe(d.cuentaOrigen, M), efectoCliente: 0 });
      break;
  }
  return p;
}

/** Utilidad propuesta en US$ (editable en el formulario). */
export function proponerUtilidad(d: DatosGenerales): number {
  const M = d.montoUsd || 0;
  switch (d.tipo) {
    case "compra":
    case "venta":
    case "swap":
      return r2((M * d.comisionClientePct) / 100);
    case "liquidacion_usdt":
      return -r2((M * d.costeLiquidacionPct) / 100);
    default:
      return 0;
  }
}

/** Qué cuentas pide el formulario según el tipo. */
export function cuentasQuePide(tipo: TipoOperacion) {
  return {
    bs: tipo === "compra" || tipo === "venta",
    usd: tipo === "compra" || tipo === "venta",
    origen: ["swap", "liquidacion_usdt", "traspaso", "prestamo", "pago", "honorarios", "comision", "gasto"].includes(tipo),
    destino: ["swap", "liquidacion_usdt", "traspaso", "cobro"].includes(tipo),
  };
}
