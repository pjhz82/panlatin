ALTER TABLE "usuarios" ADD COLUMN "usuario" text;--> statement-breakpoint
-- Los usuarios que ya existían entran con su correo hasta que se les cambie el usuario.
UPDATE "usuarios" SET "usuario" = lower("email") WHERE "usuario" IS NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "usuario" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_usuario_key" UNIQUE("usuario");
