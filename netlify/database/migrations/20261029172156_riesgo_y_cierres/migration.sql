CREATE TYPE "riesgo_cliente" AS ENUM('normal', 'alto_riesgo', 'incobrable');--> statement-breakpoint
CREATE TABLE "cierres" (
	"id" serial PRIMARY KEY,
	"fecha" date NOT NULL UNIQUE,
	"tasa" numeric(24,6),
	"disponible_usd" numeric(24,6) NOT NULL,
	"bancos_bs" numeric(24,6) NOT NULL,
	"bs_en_usd" numeric(24,6) NOT NULL,
	"por_cobrar" numeric(24,6) NOT NULL,
	"provision_incobrables" numeric(24,6) NOT NULL,
	"por_pagar" numeric(24,6) NOT NULL,
	"patrimonio" numeric(24,6) NOT NULL,
	"detalle" jsonb,
	"notas" text,
	"tipo" text DEFAULT 'manual' NOT NULL,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "riesgo" "riesgo_cliente" DEFAULT 'normal'::"riesgo_cliente" NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "riesgo_nota" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "riesgo_actualizado" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "dias_credito" integer;--> statement-breakpoint
ALTER TABLE "cierres" ADD CONSTRAINT "cierres_creado_por_usuarios_id_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id");