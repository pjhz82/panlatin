CREATE TYPE "estado_operacion" AS ENUM('pendiente_firmas', 'aprobada', 'en_ejecucion', 'completada', 'rechazada', 'anulada');--> statement-breakpoint
CREATE TYPE "tipo_operacion" AS ENUM('compra', 'venta', 'swap', 'liquidacion_usdt', 'prestamo', 'honorarios', 'comision', 'gasto', 'pago', 'cobro', 'traspaso');--> statement-breakpoint
CREATE TABLE "firmas" (
	"id" serial PRIMARY KEY,
	"operacion_id" integer NOT NULL,
	"ejecutivo_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"aprueba" boolean NOT NULL,
	"comentario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operaciones" (
	"id" serial PRIMARY KEY,
	"tipo" "tipo_operacion" NOT NULL,
	"estado" "estado_operacion" DEFAULT 'pendiente_firmas'::"estado_operacion" NOT NULL,
	"fecha" date NOT NULL,
	"subcuenta_id" integer,
	"descripcion" text,
	"monto_usd" numeric(24,6),
	"tasa" numeric(24,6),
	"monto_bs" numeric(24,6),
	"utilidad" numeric(24,6),
	"creado_por" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"motivo_cierre" text
);
--> statement-breakpoint
CREATE TABLE "partidas" (
	"id" serial PRIMARY KEY,
	"operacion_id" integer NOT NULL,
	"orden" integer NOT NULL,
	"descripcion" text NOT NULL,
	"cuenta_id" integer,
	"importe_cuenta" numeric(24,6),
	"efecto_cliente" numeric(24,6),
	"ejecutada_en" date,
	"referencia" text,
	"ejecutada_por" integer
);
--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "partida_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "firmas_operacion_ejecutivo_idx" ON "firmas" ("operacion_id","ejecutivo_id");--> statement-breakpoint
CREATE INDEX "movimientos_partida_idx" ON "movimientos" ("partida_id");--> statement-breakpoint
CREATE INDEX "operaciones_estado_idx" ON "operaciones" ("estado","fecha");--> statement-breakpoint
CREATE INDEX "operaciones_subcuenta_idx" ON "operaciones" ("subcuenta_id");--> statement-breakpoint
CREATE INDEX "partidas_operacion_idx" ON "partidas" ("operacion_id","orden");--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_operacion_id_operaciones_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operaciones"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_ejecutivo_id_ejecutivos_id_fkey" FOREIGN KEY ("ejecutivo_id") REFERENCES "ejecutivos"("id");--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_usuario_id_usuarios_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_partida_id_partidas_id_fkey" FOREIGN KEY ("partida_id") REFERENCES "partidas"("id");--> statement-breakpoint
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_subcuenta_id_subcuentas_id_fkey" FOREIGN KEY ("subcuenta_id") REFERENCES "subcuentas"("id");--> statement-breakpoint
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_creado_por_usuarios_id_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_operacion_id_operaciones_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operaciones"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_cuenta_id_cuentas_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id");--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_ejecutada_por_usuarios_id_fkey" FOREIGN KEY ("ejecutada_por") REFERENCES "usuarios"("id");