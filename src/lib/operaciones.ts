import type { EstadoOperacion, Moneda, TipoOperacion } from "@/db/schema";
import { codigoDeBanco, type DatosPagoBs } from "./bancos-ve";

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

export const SIMBOLO: Record<Moneda, string> = { BS: "Bs.", USD: "US$", USDT: "USDT", USDC: "USDC" };

/** Monedas cuyas salidas (transferencias de dólares) necesitan aprobación. */
export const MONEDAS_CON_APROBACION: Moneda[] = ["USD", "USDT", "USDC"];

/** Una partida es una transferencia de dólares si saca dinero de una cuenta en US$, USDT o USDC. */
export const esSalidaDeDolares = (importeCuenta: number, moneda: Moneda | null) =>
  importeCuenta < 0 && moneda !== null && MONEDAS_CON_APROBACION.includes(moneda);

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
  /** Partida existente (al proponer un cambio). */
  id?: number;
  descripcion: string;
  /** Cuenta sugerida (opcional): la cuenta real la pone la administradora al reportar el pago. */
  cuentaId: number | null;
  /** Moneda del pago o cobro; null si la partida no mueve banco. */
  moneda: Moneda | null;
  importeCuenta: number;
  efectoCliente: number;
  /** A dónde se paga o de dónde se cobra. */
  destino?: string;
  bancoDestino?: string;
  /** Pagos en Bs.: datos del beneficiario. */
  datosPago?: DatosPagoBs | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Partidas propuestas para los datos generales. */
export function proponerPartidas(d: DatosGenerales, monedaDe: (cuentaId: number | null) => Moneda | null): PartidaBorrador[] {
  const M = d.montoUsd || 0;
  const B = r2(M * (d.tasa || 0));
  const comCliente = r2((M * d.comisionClientePct) / 100);
  const enMonedaDe = (cuentaId: number | null, usd: number) => (monedaDe(cuentaId) === "BS" ? r2(usd * (d.tasa || 0)) : r2(usd));
  const p: PartidaBorrador[] = [];
  /** Moneda de la cuenta elegida o, sin cuenta, la habitual para ese lado. */
  const m = (cuentaId: number | null, porDefecto: Moneda): Moneda => monedaDe(cuentaId) ?? porDefecto;
  const push = (descripcion: string, cuentaId: number | null, moneda: Moneda | null, importeCuenta: number, efectoCliente: number) =>
    p.push({ descripcion, cuentaId, moneda, importeCuenta, efectoCliente });
  const comisionCliente = () => {
    if (comCliente > 0) push("Comisión cobrada al cliente", null, null, 0, -comCliente);
  };

  switch (d.tipo) {
    case "compra":
      push("Pago en Bs. por cuenta del cliente", d.cuentaBs, "BS", -B, -M);
      if (d.comisionBancoPct > 0)
        push("Comisión bancaria", d.cuentaBs, "BS", -r2((B * d.comisionBancoPct) / 100), 0);
      push("Recibimos los US$ del cliente", d.cuentaUsd, m(d.cuentaUsd, "USD"), M, M);
      comisionCliente();
      break;
    case "venta":
      push("Cobro en Bs. del cliente", d.cuentaBs, "BS", B, M);
      push("Entregamos los US$ al cliente", d.cuentaUsd, m(d.cuentaUsd, "USD"), -M, -M);
      if (d.costeLiquidacionPct > 0)
        push("Coste de liquidación", d.cuentaUsd, m(d.cuentaUsd, "USD"), -r2((M * d.costeLiquidacionPct) / 100), 0);
      comisionCliente();
      break;
    case "swap": {
      const entregado = r2(M - comCliente);
      push("Recibimos del cliente", d.cuentaOrigen, m(d.cuentaOrigen, "USD"), enMonedaDe(d.cuentaOrigen, M), M);
      push("Entregamos al cliente", d.cuentaDestino, m(d.cuentaDestino, "USD"), -enMonedaDe(d.cuentaDestino, entregado), -entregado);
      if (comCliente > 0) push("Comisión del swap", null, null, 0, -comCliente);
      break;
    }
    case "liquidacion_usdt": {
      const neto = r2(M * (1 - d.costeLiquidacionPct / 100));
      push("Sale de la wallet", d.cuentaOrigen, m(d.cuentaOrigen, "USDT"), -M, 0);
      push("Entra en la cuenta", d.cuentaDestino, m(d.cuentaDestino, "USD"), enMonedaDe(d.cuentaDestino, neto), 0);
      break;
    }
    case "traspaso":
      push("Sale de la cuenta de origen", d.cuentaOrigen, m(d.cuentaOrigen, "USD"), -enMonedaDe(d.cuentaOrigen, M), 0);
      push("Entra en la cuenta de destino", d.cuentaDestino, m(d.cuentaDestino, "USD"), enMonedaDe(d.cuentaDestino, M), 0);
      break;
    case "prestamo":
      push("Entregamos el préstamo", d.cuentaOrigen, m(d.cuentaOrigen, "USD"), -enMonedaDe(d.cuentaOrigen, M), -M);
      break;
    case "cobro":
      push("Cobro al cliente", d.cuentaDestino, m(d.cuentaDestino, "USD"), enMonedaDe(d.cuentaDestino, M), M);
      break;
    case "pago":
      push("Pago al cliente o por su cuenta", d.cuentaOrigen, m(d.cuentaOrigen, "USD"), -enMonedaDe(d.cuentaOrigen, M), -M);
      break;
    case "honorarios":
    case "comision":
    case "gasto":
      push(TIPOS_OPERACION[d.tipo].nombre, d.cuentaOrigen, m(d.cuentaOrigen, "USD"), -enMonedaDe(d.cuentaOrigen, M), 0);
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

/** Diferencias menores que esto se consideran cero (redondeo de céntimos). */
export const TOLERANCIA = 0.005;

export type DatosAvance = {
  moneda: Moneda | null;
  importe: number;
  efectoCliente: number;
  /** Suma de los pagos reportados (con signo). */
  pagado: number;
  /** Efecto en el cliente de los pagos ya llevados al balance. */
  enBalance: number;
  pagosSinBalance: number;
  ejecutadaEn: string | null;
  clienteEn: string | null;
  cerradaEn: string | null;
};

/**
 * Cómo va una partida: lo pagado frente a lo instruido y lo que ya está en el
 * balance del cliente. Las partidas aplicadas de una vez (registros de la hoja
 * o anteriores a los pagos por partes) cuentan como pagadas y en balance.
 */
export function avancePartida(p: DatosAvance, conCliente: boolean) {
  const aplicada = Boolean(p.ejecutadaEn);
  const ladoBanco = p.moneda !== null && Math.abs(p.importe) > TOLERANCIA;
  const ladoCliente = conCliente && Math.abs(p.efectoCliente) > TOLERANCIA;
  const pagado = aplicada ? p.importe : p.pagado;
  const completa = Math.abs(pagado) >= Math.abs(p.importe) - TOLERANCIA;
  const pagada = !ladoBanco || aplicada || Boolean(p.cerradaEn) || completa;
  const falta = pagada ? 0 : r2(p.importe - pagado);
  const enBalance = !ladoCliente ? 0 : aplicada ? p.efectoCliente : ladoBanco ? p.enBalance : p.clienteEn ? p.efectoCliente : 0;
  const balanceAlDia = !ladoCliente || aplicada || (ladoBanco ? p.pagosSinBalance === 0 : Boolean(p.clienteEn));
  return {
    ladoBanco,
    ladoCliente,
    pagado,
    falta,
    pagada,
    /** Pagado de más (+) o de menos (−) respecto a lo instruido, en valor absoluto con signo. */
    diferencia: ladoBanco && !aplicada ? r2(Math.abs(pagado) - Math.abs(p.importe)) : 0,
    pct: ladoBanco && Math.abs(p.importe) > 0 ? Math.min(1, Math.abs(pagado) / Math.abs(p.importe)) : 1,
    enBalance,
    /** Lo que aún falta por llevar al balance del cliente (pagado o sin banco). */
    pendienteBalance: ladoCliente && !balanceAlDia,
    terminada: pagada && balanceAlDia,
  };
}

/** Nombre del banco normalizado para comparar (sin tildes, mayúsculas ni espacios). */
export const normalizarBanco = (b: string | null | undefined) =>
  (b ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Un pago es interbancario si el banco de destino es distinto del de nuestra
 * cuenta (cuando se conocen los dos). Los bancos venezolanos se comparan por
 * código, así «BDV» y «Banco de Venezuela» son el mismo.
 */
export function esInterbancario(bancoCuenta: string | null | undefined, bancoDestino: string | null | undefined) {
  const a = codigoDeBanco(bancoCuenta);
  const b = codigoDeBanco(bancoDestino);
  if (a && b) return a !== b;
  return Boolean(normalizarBanco(bancoCuenta) && normalizarBanco(bancoDestino)) && normalizarBanco(bancoCuenta) !== normalizarBanco(bancoDestino);
}
