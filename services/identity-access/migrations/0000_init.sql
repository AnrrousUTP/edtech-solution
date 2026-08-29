-- Editado tras generar: el schema ya lo crea el bootstrap (doc 03 §1) y el rol
-- del servicio no tiene CREATE sobre la base — IF NOT EXISTS lo hace inocuo.
CREATE SCHEMA IF NOT EXISTS "identity";
--> statement-breakpoint
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
CREATE TYPE "identity"."origen_nivel" AS ENUM('TEST', 'AUTODECLARADO', 'PROGRESION');--> statement-breakpoint
CREATE TYPE "identity"."rol_dominio" AS ENUM('ESTUDIANTE', 'ADMIN');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity"."preferencias" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"notif_email" boolean DEFAULT true NOT NULL,
	"recordatorio_racha" boolean DEFAULT true NOT NULL,
	"zona_horaria" text DEFAULT 'America/Lima' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity"."processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity"."usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"nombre_visible" text NOT NULL,
	"avatar_url" text,
	"pais" char(2),
	"idioma" char(2) DEFAULT 'es' NOT NULL,
	"rol" "identity"."rol_dominio" DEFAULT 'ESTUDIANTE' NOT NULL,
	"nivel" char(1) DEFAULT 'A' NOT NULL,
	"origen_nivel" "identity"."origen_nivel" DEFAULT 'AUTODECLARADO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identity"."preferencias" ADD CONSTRAINT "preferencias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identity"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
