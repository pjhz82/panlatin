ALTER TABLE "operaciones" ADD COLUMN "origen" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "operaciones" ADD COLUMN "ejecutivo_id" integer;--> statement-breakpoint
ALTER TABLE "operaciones" ADD COLUMN "contraparte" text;--> statement-breakpoint
CREATE INDEX "operaciones_fecha_idx" ON "operaciones" ("fecha");--> statement-breakpoint
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_ejecutivo_id_ejecutivos_id_fkey" FOREIGN KEY ("ejecutivo_id") REFERENCES "ejecutivos"("id");