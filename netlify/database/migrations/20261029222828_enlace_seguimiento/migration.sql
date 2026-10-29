ALTER TABLE "operaciones" ADD COLUMN "enlace_token" text;--> statement-breakpoint
ALTER TABLE "operaciones" ADD COLUMN "enlace_creado" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_enlace_token_key" UNIQUE("enlace_token");