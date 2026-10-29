import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const rolUsuario = pgEnum("rol_usuario", [
  "admin",
  "ejecutivo",
  "operadora",
  "cliente",
]);

export const tipoCuenta = pgEnum("tipo_cuenta", [
  "banco",
  "wallet",
  "exchange",
  "caja",
]);

export const moneda = pgEnum("moneda", ["BS", "USD", "USDT", "USDC"]);

export const redBlockchain = pgEnum("red_blockchain", ["TRON", "ETH"]);

export const riesgoCliente = pgEnum("riesgo_cliente", ["normal", "alto_riesgo", "incobrable"]);

export const tipoOperacion = pgEnum("tipo_operacion", [
  "compra",
  "venta",
  "swap",
  "liquidacion_usdt",
  "prestamo",
  "honorarios",
  "comision",
  "gasto",
  "pago",
  "cobro",
  "traspaso",
]);

export const estadoCambio = pgEnum("estado_cambio", ["pendiente", "aplicado", "rechazado", "retirado"]);

export const estadoOperacion = pgEnum("estado_operacion", [
  "pendiente_firmas",
  "aprobada",
  "en_ejecucion",
  "completada",
  "rechazada",
  "anulada",
]);

const creadoEn = () =>
  timestamp("creado_en", { withTimezone: true }).notNull().defaultNow();

/** Empresas del holding. */
export const empresas = pgTable("empresas", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  pais: text("pais"),
  activa: boolean("activa").notNull().default(true),
  creadoEn: creadoEn(),
});

/** Ejecutivos (socios) que traen clientes y firman los pedidos: FCLP, PH, JCMDA… */
export const ejecutivos = pgTable("ejecutivos", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: creadoEn(),
});

/** Cliente titular. Un usuario cliente ve todas sus subcuentas. */
export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  ejecutivoId: integer("ejecutivo_id").references(() => ejecutivos.id),
  notas: text("notas"),
  activo: boolean("activo").notNull().default(true),
  /** Riesgo de cobro. Los incobrables se provisionan en el balance. */
  riesgo: riesgoCliente("riesgo").notNull().default("normal"),
  riesgoNota: text("riesgo_nota"),
  riesgoActualizado: timestamp("riesgo_actualizado", { withTimezone: true }),
  /** Plazo de pago en días desde que la cuenta queda en deuda. Sin valor: sin plazo pactado. */
  diasCredito: integer("dias_credito"),
  creadoEn: creadoEn(),
});

/**
 * Subcuenta de un cliente (p. ej. "Cliente - Empresa A"). Cada una lleva
 * su propio estado de cuenta, como si fuera un cliente distinto.
 */
export const subcuentas = pgTable(
  "subcuentas",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id),
    nombre: text("nombre").notNull().unique(),
    ejecutivoId: integer("ejecutivo_id").references(() => ejecutivos.id),
    activa: boolean("activa").notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [index("subcuentas_cliente_idx").on(t.clienteId)],
);

/** Cuentas de tesorería: bancos, wallets, exchanges y cajas de efectivo. */
export const cuentas = pgTable(
  "cuentas",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull().unique(),
    tipo: tipoCuenta("tipo").notNull(),
    moneda: moneda("moneda").notNull(),
    empresaId: integer("empresa_id").references(() => empresas.id),
    /** Banco o exchange (BDV, Banesco, Binance…). */
    entidad: text("entidad"),
    /** Últimos dígitos o identificador de la cuenta bancaria. */
    numero: text("numero"),
    red: redBlockchain("red"),
    direccion: text("direccion"),
    /** Límite diario de transferencias a otros bancos, en la moneda de la cuenta. */
    limiteInterbancario: numeric("limite_interbancario", { precision: 24, scale: 6 }),
    activa: boolean("activa").notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("cuentas_direccion_red_idx").on(t.red, t.direccion)],
);

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  /** Nombre con el que se entra (p. ej. "carmen"). */
  usuario: text("usuario").notNull().unique(),
  /** Opcional; también sirve para entrar. */
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  rol: rolUsuario("rol").notNull(),
  /** Solo para rol ejecutivo. */
  ejecutivoId: integer("ejecutivo_id").references(() => ejecutivos.id),
  /** Solo para rol cliente. */
  clienteId: integer("cliente_id").references(() => clientes.id),
  activo: boolean("activo").notNull().default(true),
  /** Contraseña temporal: al entrar se le pide cambiarla. */
  debeCambiarPassword: boolean("debe_cambiar_password").notNull().default(false),
  ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true }),
  creadoEn: creadoEn(),
});

export const sesiones = pgTable(
  "sesiones",
  {
    /** SHA-256 del token que viaja en la cookie; el token en claro nunca se guarda. */
    id: text("id").primaryKey(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [index("sesiones_usuario_idx").on(t.usuarioId)],
);

/**
 * Movimientos de un estado de cuenta: o de una subcuenta de cliente o de una
 * cuenta de tesorería. Importe con signo: positivo = abono / entrada,
 * negativo = cargo / salida. El saldo se calcula acumulando por fecha.
 */
export const movimientos = pgTable(
  "movimientos",
  {
    id: serial("id").primaryKey(),
    fecha: date("fecha").notNull(),
    subcuentaId: integer("subcuenta_id").references(() => subcuentas.id),
    cuentaId: integer("cuenta_id").references(() => cuentas.id),
    concepto: text("concepto"),
    detalle: text("detalle"),
    formaPago: text("forma_pago"),
    referencia: text("referencia"),
    nota: text("nota"),
    importe: numeric("importe", { precision: 24, scale: 6 }).notNull(),
    /** "excel" si viene de la importación de los Excel; "manual" si se registró en la web. */
    origen: text("origen").notNull().default("manual"),
    /** Partida de operación que generó el movimiento (si lo generó una). */
    partidaId: integer("partida_id").references(() => partidas.id),
    /** Pago reportado que generó el movimiento (banco) o que se llevó al balance (cliente). */
    pagoId: integer("pago_id").references(() => pagos.id),
    creadoPor: integer("creado_por").references(() => usuarios.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("movimientos_partida_idx").on(t.partidaId),
    index("movimientos_pago_idx").on(t.pagoId),
    index("movimientos_subcuenta_idx").on(t.subcuentaId, t.fecha, t.id),
    index("movimientos_cuenta_idx").on(t.cuentaId, t.fecha, t.id),
    check("movimientos_un_destino", sql`(${t.subcuentaId} is null) <> (${t.cuentaId} is null)`),
  ],
);

/**
 * Operación (compra, venta, swap…). La crea una operadora o un administrador,
 * la firman dos ejecutivos y se ejecuta partida a partida.
 */
export const operaciones = pgTable(
  "operaciones",
  {
    id: serial("id").primaryKey(),
    tipo: tipoOperacion("tipo").notNull(),
    estado: estadoOperacion("estado").notNull().default("pendiente_firmas"),
    fecha: date("fecha").notNull(),
    subcuentaId: integer("subcuenta_id").references(() => subcuentas.id),
    descripcion: text("descripcion"),
    /** Datos de referencia de la operación (no generan movimientos por sí solos). */
    montoUsd: numeric("monto_usd", { precision: 24, scale: 6 }),
    tasa: numeric("tasa", { precision: 24, scale: 6 }),
    montoBs: numeric("monto_bs", { precision: 24, scale: 6 }),
    /** Utilidad estimada de la operación en US$, para el reparto posterior. */
    utilidad: numeric("utilidad", { precision: 24, scale: 6 }),
    creadoPor: integer("creado_por")
      .notNull()
      .references(() => usuarios.id),
    creadoEn: creadoEn(),
    motivoCierre: text("motivo_cierre"),
    /** Registrada desde la hoja del cliente: al tener las firmas se ejecuta sola, con su fecha. */
    ejecutarAlAprobar: boolean("ejecutar_al_aprobar").notNull().default(false),
    /** "web" si se montó en la web; "excel" si es histórica importada (sin partidas ni movimientos). */
    origen: text("origen").notNull().default("web"),
    /** Ejecutivo de la operación (para filtrar y repartir). */
    ejecutivoId: integer("ejecutivo_id").references(() => ejecutivos.id),
    /** Proveedor o cliente final con quien se hizo la operación. */
    contraparte: text("contraparte"),
    /** Enlace público de seguimiento para el cliente (sin usuario). Null: sin enlace. */
    enlaceToken: text("enlace_token").unique(),
    enlaceCreado: timestamp("enlace_creado", { withTimezone: true }),
  },
  (t) => [
    index("operaciones_estado_idx").on(t.estado, t.fecha),
    index("operaciones_fecha_idx").on(t.fecha),
    index("operaciones_subcuenta_idx").on(t.subcuentaId),
  ],
);

/**
 * Partida de una operación: un pago o un cobro. Al ejecutarla genera un
 * movimiento en la cuenta de tesorería (importe en su moneda) y otro en el
 * estado de cuenta del cliente (efecto en US$), si los tiene.
 */
export const partidas = pgTable(
  "partidas",
  {
    id: serial("id").primaryKey(),
    operacionId: integer("operacion_id")
      .notNull()
      .references(() => operaciones.id, { onDelete: "cascade" }),
    orden: integer("orden").notNull(),
    descripcion: text("descripcion").notNull(),
    /** Cuenta sugerida; la cuenta real de cada pago la pone la administradora al reportarlo. */
    cuentaId: integer("cuenta_id").references(() => cuentas.id),
    /** Moneda del pago o cobro instruido. Sin moneda: la partida no mueve banco (solo afecta al cliente). */
    moneda: moneda("moneda"),
    /** Importe instruido, en su moneda. Positivo = entra; negativo = sale. */
    importeCuenta: numeric("importe_cuenta", { precision: 24, scale: 6 }),
    /** En US$. Positivo = abono al cliente; negativo = cargo. */
    efectoCliente: numeric("efecto_cliente", { precision: 24, scale: 6 }),
    /** A dónde se paga o de dónde se cobra: beneficiario, cuenta o wallet. */
    destino: text("destino"),
    /** Banco de destino, para saber si el pago es interbancario. */
    bancoDestino: text("banco_destino"),
    /** Pagos en Bs.: titular, cédula/RIF, banco y cuenta (o teléfono de pago móvil). */
    datosPago: jsonb("datos_pago"),
    /** Aplicada de una vez (registros de la hoja y operaciones anteriores a los pagos por partes). */
    ejecutadaEn: date("ejecutada_en"),
    referencia: text("referencia"),
    ejecutadaPor: integer("ejecutada_por").references(() => usuarios.id),
    /** Partida sin banco llevada al balance del cliente. */
    clienteEn: date("cliente_en"),
    clientePor: integer("cliente_por").references(() => usuarios.id),
    /** Cerrada aunque lo pagado no coincida con lo instruido. */
    cerradaEn: date("cerrada_en"),
    cerradaNota: text("cerrada_nota"),
  },
  (t) => [index("partidas_operacion_idx").on(t.operacionId, t.orden)],
);

/**
 * Pago enviado o recibido para una partida (puede haber varios: pagos por
 * partes). Al reportarlo se mueve la cuenta; al llevarlo al balance, el cliente.
 */
export const pagos = pgTable(
  "pagos",
  {
    id: serial("id").primaryKey(),
    partidaId: integer("partida_id")
      .notNull()
      .references(() => partidas.id),
    cuentaId: integer("cuenta_id")
      .notNull()
      .references(() => cuentas.id),
    fecha: date("fecha").notNull(),
    /** En la moneda de la cuenta. Positivo = entra; negativo = sale. */
    importe: numeric("importe", { precision: 24, scale: 6 }).notNull(),
    /** Parte del efecto en el cliente (US$) que corresponde a este pago. */
    efectoCliente: numeric("efecto_cliente", { precision: 24, scale: 6 }).notNull().default("0"),
    referencia: text("referencia"),
    /** Transferencia a otro banco: cuenta para el límite diario. */
    interbancario: boolean("interbancario").notNull().default(false),
    nota: text("nota"),
    reportadoPor: integer("reportado_por")
      .notNull()
      .references(() => usuarios.id),
    reportadoEn: creadoEn(),
    /** Llevado al balance del cliente (revisado). */
    balanceEn: date("balance_en"),
    balancePor: integer("balance_por").references(() => usuarios.id),
  },
  (t) => [index("pagos_partida_idx").on(t.partidaId), index("pagos_cuenta_fecha_idx").on(t.cuentaId, t.fecha)],
);

/** Cambio propuesto a una operación: se aplica cuando lo aprueban dos ejecutivos. */
export const cambios = pgTable(
  "cambios",
  {
    id: serial("id").primaryKey(),
    operacionId: integer("operacion_id")
      .notNull()
      .references(() => operaciones.id, { onDelete: "cascade" }),
    estado: estadoCambio("estado").notNull().default("pendiente"),
    motivo: text("motivo").notNull(),
    /** Cómo quedaría la operación: datos generales y partidas. */
    propuesta: jsonb("propuesta").notNull(),
    /** Cómo estaba al proponer el cambio, para comparar. */
    anterior: jsonb("anterior").notNull(),
    creadoPor: integer("creado_por")
      .notNull()
      .references(() => usuarios.id),
    creadoEn: creadoEn(),
    resueltoEn: timestamp("resuelto_en", { withTimezone: true }),
    comentario: text("comentario"),
  },
  (t) => [index("cambios_operacion_idx").on(t.operacionId, t.estado)],
);

export const firmasCambio = pgTable(
  "firmas_cambio",
  {
    id: serial("id").primaryKey(),
    cambioId: integer("cambio_id")
      .notNull()
      .references(() => cambios.id, { onDelete: "cascade" }),
    ejecutivoId: integer("ejecutivo_id")
      .notNull()
      .references(() => ejecutivos.id),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    aprueba: boolean("aprueba").notNull(),
    comentario: text("comentario"),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("firmas_cambio_ejecutivo_idx").on(t.cambioId, t.ejecutivoId)],
);

/** Firma de un ejecutivo sobre una operación (aprobación o rechazo). */
export const firmas = pgTable(
  "firmas",
  {
    id: serial("id").primaryKey(),
    operacionId: integer("operacion_id")
      .notNull()
      .references(() => operaciones.id, { onDelete: "cascade" }),
    ejecutivoId: integer("ejecutivo_id")
      .notNull()
      .references(() => ejecutivos.id),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    aprueba: boolean("aprueba").notNull(),
    comentario: text("comentario"),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("firmas_operacion_ejecutivo_idx").on(t.operacionId, t.ejecutivoId)],
);

/**
 * Cierre diario del balance: foto guardada del balance del holding a una
 * fecha, con la tasa usada, para consultar la evolución y la ganancia diaria.
 */
export const cierres = pgTable("cierres", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull().unique(),
  tasa: numeric("tasa", { precision: 24, scale: 6 }),
  /** Bancos US$, caja, wallets y exchanges (US$). */
  disponibleUsd: numeric("disponible_usd", { precision: 24, scale: 6 }).notNull(),
  /** Bancos en bolívares (Bs.) y su equivalente en US$ con la tasa. */
  bancosBs: numeric("bancos_bs", { precision: 24, scale: 6 }).notNull(),
  bsEnUsd: numeric("bs_en_usd", { precision: 24, scale: 6 }).notNull(),
  porCobrar: numeric("por_cobrar", { precision: 24, scale: 6 }).notNull(),
  /** Por cobrar a clientes incobrables (se resta del activo). */
  provisionIncobrables: numeric("provision_incobrables", { precision: 24, scale: 6 }).notNull(),
  porPagar: numeric("por_pagar", { precision: 24, scale: 6 }).notNull(),
  patrimonio: numeric("patrimonio", { precision: 24, scale: 6 }).notNull(),
  /** Saldos por cuenta y otros datos del momento del cierre. */
  detalle: jsonb("detalle"),
  notas: text("notas"),
  /** "manual" (botón Guardar cierre) o "calculado" (generado para días pasados). */
  tipo: text("tipo").notNull().default("manual"),
  creadoPor: integer("creado_por").references(() => usuarios.id),
  creadoEn: creadoEn(),
});

/** Saldo que mostraba cada hoja de Excel al importarla, para revisar que cuadra. */
export const referenciasExcel = pgTable(
  "referencias_excel",
  {
    id: serial("id").primaryKey(),
    subcuentaId: integer("subcuenta_id").references(() => subcuentas.id),
    cuentaId: integer("cuenta_id").references(() => cuentas.id),
    hoja: text("hoja").notNull(),
    saldo: numeric("saldo", { precision: 24, scale: 6 }),
    movimientos: integer("movimientos").notNull(),
    cargadoEn: timestamp("cargado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("referencias_subcuenta_idx").on(t.subcuentaId),
    uniqueIndex("referencias_cuenta_idx").on(t.cuentaId),
  ],
);

/** Registro de quién hizo qué y cuándo. */
export const auditoria = pgTable(
  "auditoria",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id").references(() => usuarios.id),
    accion: text("accion").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: integer("entidad_id"),
    detalle: jsonb("detalle"),
    creadoEn: creadoEn(),
  },
  (t) => [index("auditoria_entidad_idx").on(t.entidad, t.entidadId)],
);

/** Parámetros generales (p. ej. firmas requeridas por pedido). */
export const configuracion = pgTable("configuracion", {
  clave: text("clave").primaryKey(),
  valor: jsonb("valor").notNull(),
});

export type Rol = (typeof rolUsuario.enumValues)[number];
export type TipoCuenta = (typeof tipoCuenta.enumValues)[number];
export type Moneda = (typeof moneda.enumValues)[number];
export type Red = (typeof redBlockchain.enumValues)[number];
export type TipoOperacion = (typeof tipoOperacion.enumValues)[number];
export type RiesgoCliente = (typeof riesgoCliente.enumValues)[number];
export type EstadoOperacion = (typeof estadoOperacion.enumValues)[number];
export type EstadoCambio = (typeof estadoCambio.enumValues)[number];
