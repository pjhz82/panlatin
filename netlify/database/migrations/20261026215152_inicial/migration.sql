CREATE TYPE "moneda" AS ENUM('BS', 'USD', 'USDT', 'USDC');--> statement-breakpoint
CREATE TYPE "red_blockchain" AS ENUM('TRON', 'ETH');--> statement-breakpoint
CREATE TYPE "rol_usuario" AS ENUM('admin', 'ejecutivo', 'operadora', 'cliente');--> statement-breakpoint
CREATE TYPE "tipo_cuenta" AS ENUM('banco', 'wallet', 'exchange', 'caja');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY,
	"usuario_id" integer,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" integer,
	"detalle" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY,
	"nombre" text NOT NULL UNIQUE,
	"ejecutivo_id" integer,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion" (
	"clave" text PRIMARY KEY,
	"valor" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuentas" (
	"id" serial PRIMARY KEY,
	"nombre" text NOT NULL UNIQUE,
	"tipo" "tipo_cuenta" NOT NULL,
	"moneda" "moneda" NOT NULL,
	"empresa_id" integer,
	"entidad" text,
	"numero" text,
	"red" "red_blockchain",
	"direccion" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ejecutivos" (
	"id" serial PRIMARY KEY,
	"codigo" text NOT NULL UNIQUE,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" serial PRIMARY KEY,
	"nombre" text NOT NULL UNIQUE,
	"pais" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY,
	"usuario_id" integer NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcuentas" (
	"id" serial PRIMARY KEY,
	"cliente_id" integer NOT NULL,
	"nombre" text NOT NULL UNIQUE,
	"ejecutivo_id" integer,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY,
	"nombre" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"rol" "rol_usuario" NOT NULL,
	"ejecutivo_id" integer,
	"cliente_id" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" ("entidad","entidad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_direccion_red_idx" ON "cuentas" ("red","direccion");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" ("usuario_id");--> statement-breakpoint
CREATE INDEX "subcuentas_cliente_idx" ON "subcuentas" ("cliente_id");--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_ejecutivo_id_ejecutivos_id_fkey" FOREIGN KEY ("ejecutivo_id") REFERENCES "ejecutivos"("id");--> statement-breakpoint
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_empresa_id_empresas_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id");--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subcuentas" ADD CONSTRAINT "subcuentas_cliente_id_clientes_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id");--> statement-breakpoint
ALTER TABLE "subcuentas" ADD CONSTRAINT "subcuentas_ejecutivo_id_ejecutivos_id_fkey" FOREIGN KEY ("ejecutivo_id") REFERENCES "ejecutivos"("id");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_ejecutivo_id_ejecutivos_id_fkey" FOREIGN KEY ("ejecutivo_id") REFERENCES "ejecutivos"("id");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cliente_id_clientes_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id");