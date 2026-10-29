CREATE TABLE "comprobantes" (
	"id" serial PRIMARY KEY,
	"pago_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"tamano" integer NOT NULL,
	"datos" bytea NOT NULL,
	"subido_por" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "comprobantes_pago_idx" ON "comprobantes" ("pago_id");--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_pago_id_pagos_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_subido_por_usuarios_id_fkey" FOREIGN KEY ("subido_por") REFERENCES "usuarios"("id");