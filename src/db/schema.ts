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
    creadoPor: integer("creado_por").references(() => usuarios.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("movimientos_subcuenta_idx").on(t.subcuentaId, t.fecha, t.id),
    index("movimientos_cuenta_idx").on(t.cuentaId, t.fecha, t.id),
    check("movimientos_un_destino", sql`(${t.subcuentaId} is null) <> (${t.cuentaId} is null)`),
  ],
);

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
