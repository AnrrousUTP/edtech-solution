-- El rol de gestión de la plataforma es docente; ADMIN deja de ser un rol.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
BEGIN;
--> statement-breakpoint
ALTER TABLE "identity"."usuarios" ALTER COLUMN "rol" DROP DEFAULT;
--> statement-breakpoint
ALTER TYPE "identity"."rol_dominio" RENAME TO "rol_dominio_legacy";
--> statement-breakpoint
CREATE TYPE "identity"."rol_dominio" AS ENUM('ESTUDIANTE', 'DOCENTE', 'AFILIADO');
--> statement-breakpoint
ALTER TABLE "identity"."usuarios"
  ALTER COLUMN "rol" TYPE "identity"."rol_dominio"
  USING (
    CASE WHEN "rol"::text = 'ADMIN' THEN 'DOCENTE' ELSE "rol"::text END
  )::"identity"."rol_dominio";
--> statement-breakpoint
ALTER TABLE "identity"."usuarios"
  ALTER COLUMN "rol" SET DEFAULT 'ESTUDIANTE';
--> statement-breakpoint
DROP TYPE "identity"."rol_dominio_legacy";
--> statement-breakpoint
COMMIT;
