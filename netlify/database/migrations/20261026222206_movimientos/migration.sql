CREATE TABLE "movimientos" (
	"id" serial PRIMARY KEY,
	"fecha" date NOT NULL,
	"subcuenta_id" integer,
	"cuenta_id" integer,
	"concepto" text,
	"detalle" text,
	"forma_pago" text,
	"referencia" text,
	"nota" text,
	"importe" numeric(24,6) NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_un_destino" CHECK (("subcuenta_id" is null) <> ("cuenta_id" is null))
);
--> statement-breakpoint
CREATE TABLE "referencias_excel" (
	"id" serial PRIMARY KEY,
	"subcuenta_id" integer,
	"cuenta_id" integer,
	"hoja" text NOT NULL,
	"saldo" numeric(24,6),
	"movimientos" integer NOT NULL,
	"cargado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "debe_cambiar_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "movimientos_subcuenta_idx" ON "movimientos" ("subcuenta_id","fecha","id");--> statement-breakpoint
CREATE INDEX "movimientos_cuenta_idx" ON "movimientos" ("cuenta_id","fecha","id");--> statement-breakpoint
CREATE UNIQUE INDEX "referencias_subcuenta_idx" ON "referencias_excel" ("subcuenta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referencias_cuenta_idx" ON "referencias_excel" ("cuenta_id");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_subcuenta_id_subcuentas_id_fkey" FOREIGN KEY ("subcuenta_id") REFERENCES "subcuentas"("id");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cuenta_id_cuentas_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_creado_por_usuarios_id_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "referencias_excel" ADD CONSTRAINT "referencias_excel_subcuenta_id_subcuentas_id_fkey" FOREIGN KEY ("subcuenta_id") REFERENCES "subcuentas"("id");--> statement-breakpoint
ALTER TABLE "referencias_excel" ADD CONSTRAINT "referencias_excel_cuenta_id_cuentas_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id");