CREATE TYPE "estado_cambio" AS ENUM('pendiente', 'aplicado', 'rechazado', 'retirado');--> statement-breakpoint
CREATE TABLE "cambios" (
	"id" serial PRIMARY KEY,
	"operacion_id" integer NOT NULL,
	"estado" "estado_cambio" DEFAULT 'pendiente'::"estado_cambio" NOT NULL,
	"motivo" text NOT NULL,
	"propuesta" jsonb NOT NULL,
	"anterior" jsonb NOT NULL,
	"creado_por" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone,
	"comentario" text
);
--> statement-breakpoint
CREATE TABLE "firmas_cambio" (
	"id" serial PRIMARY KEY,
	"cambio_id" integer NOT NULL,
	"ejecutivo_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"aprueba" boolean NOT NULL,
	"comentario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" serial PRIMARY KEY,
	"partida_id" integer NOT NULL,
	"cuenta_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(24,6) NOT NULL,
	"efecto_cliente" numeric(24,6) DEFAULT '0' NOT NULL,
	"referencia" text,
	"interbancario" boolean DEFAULT false NOT NULL,
	"nota" text,
	"reportado_por" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"balance_en" date,
	"balance_por" integer
);
--> statement-breakpoint
ALTER TABLE "cuentas" ADD COLUMN "limite_interbancario" numeric(24,6);--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "pago_id" integer;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "moneda" "moneda";--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "destino" text;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "banco_destino" text;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "cliente_en" date;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "cliente_por" integer;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "cerrada_en" date;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "cerrada_nota" text;--> statement-breakpoint
CREATE INDEX "cambios_operacion_idx" ON "cambios" ("operacion_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "firmas_cambio_ejecutivo_idx" ON "firmas_cambio" ("cambio_id","ejecutivo_id");--> statement-breakpoint
CREATE INDEX "movimientos_pago_idx" ON "movimientos" ("pago_id");--> statement-breakpoint
CREATE INDEX "pagos_partida_idx" ON "pagos" ("partida_id");--> statement-breakpoint
CREATE INDEX "pagos_cuenta_fecha_idx" ON "pagos" ("cuenta_id","fecha");--> statement-breakpoint
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_operacion_id_operaciones_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operaciones"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_creado_por_usuarios_id_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "firmas_cambio" ADD CONSTRAINT "firmas_cambio_cambio_id_cambios_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "firmas_cambio" ADD CONSTRAINT "firmas_cambio_ejecutivo_id_ejecutivos_id_fkey" FOREIGN KEY ("ejecutivo_id") REFERENCES "ejecutivos"("id");--> statement-breakpoint
ALTER TABLE "firmas_cambio" ADD CONSTRAINT "firmas_cambio_usuario_id_usuarios_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_pago_id_pagos_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id");--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_partida_id_partidas_id_fkey" FOREIGN KEY ("partida_id") REFERENCES "partidas"("id");--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuenta_id_cuentas_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id");--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_reportado_por_usuarios_id_fkey" FOREIGN KEY ("reportado_por") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_balance_por_usuarios_id_fkey" FOREIGN KEY ("balance_por") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_cliente_por_usuarios_id_fkey" FOREIGN KEY ("cliente_por") REFERENCES "usuarios"("id");--> statement-breakpoint
-- Las partidas existentes toman la moneda de su cuenta.
UPDATE "partidas" SET "moneda" = "cuentas"."moneda" FROM "cuentas" WHERE "cuentas"."id" = "partidas"."cuenta_id" AND "partidas"."moneda" IS NULL;
