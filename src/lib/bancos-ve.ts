/**
 * Bancos de Venezuela con su código (los 4 primeros dígitos de la cuenta) y
 * los nombres con que aparecen en nuestras cuentas, para saber si un pago es
 * interbancario.
 */
export const BANCOS_VE = [
  { codigo: "0102", nombre: "Banco de Venezuela", alias: ["BDV", "Venezuela"] },
  { codigo: "0104", nombre: "Venezolano de Crédito", alias: ["BVC"] },
  { codigo: "0105", nombre: "Mercantil", alias: [] },
  { codigo: "0108", nombre: "Provincial", alias: ["BBVA Provincial", "BBVA"] },
  { codigo: "0114", nombre: "Bancaribe", alias: [] },
  { codigo: "0115", nombre: "Exterior", alias: ["Banco Exterior"] },
  { codigo: "0128", nombre: "Caroní", alias: ["Banco Caroni"] },
  { codigo: "0134", nombre: "Banesco", alias: [] },
  { codigo: "0137", nombre: "Sofitasa", alias: [] },
  { codigo: "0138", nombre: "Banco Plaza", alias: ["Plaza"] },
  { codigo: "0146", nombre: "Bangente", alias: [] },
  { codigo: "0151", nombre: "BFC Banco Fondo Común", alias: ["BFC", "Fondo Comun"] },
  { codigo: "0156", nombre: "100% Banco", alias: ["100 Banco"] },
  { codigo: "0157", nombre: "DelSur", alias: ["Del Sur"] },
  { codigo: "0163", nombre: "Banco del Tesoro", alias: ["Tesoro"] },
  { codigo: "0166", nombre: "Banco Agrícola de Venezuela", alias: ["Agricola"] },
  { codigo: "0168", nombre: "Bancrecer", alias: [] },
  { codigo: "0169", nombre: "R4 Banco Microfinanciero", alias: ["R4", "Mi Banco"] },
  { codigo: "0171", nombre: "Banco Activo", alias: ["Activo"] },
  { codigo: "0172", nombre: "Bancamiga", alias: [] },
  { codigo: "0173", nombre: "Banco Internacional de Desarrollo", alias: ["BID"] },
  { codigo: "0174", nombre: "Banplus", alias: [] },
  { codigo: "0175", nombre: "Banco Digital de los Trabajadores", alias: ["Bicentenario", "BDT"] },
  { codigo: "0177", nombre: "Banfanb", alias: [] },
  { codigo: "0178", nombre: "N58 Banco Digital", alias: ["N58"] },
  { codigo: "0191", nombre: "BNC Nacional de Crédito", alias: ["BNC"] },
] as const;

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

export const bancoPorCodigo = (codigo: string | null | undefined) => BANCOS_VE.find((b) => b.codigo === codigo) ?? null;

/** Código del banco a partir de su nombre o alias (p. ej. "BDV" → "0102"). */
export function codigoDeBanco(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const n = normalizar(nombre);
  if (!n) return null;
  const b = BANCOS_VE.find((x) => [x.nombre, ...x.alias].some((a) => normalizar(a) === n));
  return b?.codigo ?? null;
}

export const soloDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

export type MetodoPagoBs = "transferencia" | "pago_movil";

/** Datos que hacen falta para pagar en bolívares. */
export type DatosPagoBs = {
  metodo: MetodoPagoBs;
  titular: string;
  /** Cédula o RIF: V-12345678, E-…, J-…, G-…, P-… */
  documento: string;
  /** Código del banco de destino (0102, 0134…). */
  banco: string;
  /** Transferencia: número de cuenta de 20 dígitos. */
  cuenta?: string;
  /** Pago móvil: teléfono 04XX-XXXXXXX. */
  telefono?: string;
};

export const datosPagoVacios = (): DatosPagoBs => ({ metodo: "transferencia", titular: "", documento: "", banco: "", cuenta: "", telefono: "" });

/** Problemas de los datos de pago en Bs. (vacío si están completos). */
export function erroresDatosPagoBs(d: Partial<DatosPagoBs> | null | undefined): string[] {
  if (!d) return ["faltan los datos del beneficiario"];
  const e: string[] = [];
  if (!d.titular?.trim()) e.push("falta el titular");
  if (!/^[VEJGP]-?\d{5,10}$/i.test((d.documento ?? "").replace(/[.\s]/g, ""))) e.push("la cédula o RIF debe ser como V-12345678 o J-123456789");
  if (!bancoPorCodigo(d.banco)) e.push("elige el banco");
  if (d.metodo === "pago_movil") {
    if (!/^04(12|14|16|22|24|26)\d{7}$/.test(soloDigitos(d.telefono))) e.push("el teléfono debe ser como 0414-1234567");
  } else {
    const c = soloDigitos(d.cuenta);
    if (c.length !== 20) e.push("la cuenta debe tener 20 dígitos");
    else if (d.banco && c.slice(0, 4) !== d.banco) e.push("los 4 primeros dígitos de la cuenta no son del banco elegido");
  }
  return e;
}

/** Datos listos para copiar y pegar en la banca en línea. */
export function textoDatosPagoBs(d: DatosPagoBs): string {
  const banco = bancoPorCodigo(d.banco);
  const lineas = [
    d.metodo === "pago_movil" ? "Pago móvil" : "Transferencia",
    `Titular: ${d.titular}`,
    `Cédula/RIF: ${d.documento.toUpperCase()}`,
    `Banco: ${banco ? `${banco.codigo} ${banco.nombre}` : d.banco}`,
    d.metodo === "pago_movil" ? `Teléfono: ${d.telefono}` : `Cuenta: ${soloDigitos(d.cuenta)}`,
  ];
  return lineas.join("\n");
}

/**
 * Destino sin datos sensibles, para el enlace público: titular, banco y los
 * últimos 4 dígitos de la cuenta o del teléfono.
 */
export function destinoResumido(datos: DatosPagoBs | null | undefined, bancoDestino: string | null | undefined): string | null {
  if (!datos) return bancoDestino ?? null;
  const banco = bancoPorCodigo(datos.banco)?.nombre ?? bancoDestino;
  const final = soloDigitos(datos.metodo === "pago_movil" ? datos.telefono : datos.cuenta).slice(-4);
  return [datos.titular, banco, `${datos.metodo === "pago_movil" ? "pago móvil" : "cta."} ****${final}`].filter(Boolean).join(" · ");
}
