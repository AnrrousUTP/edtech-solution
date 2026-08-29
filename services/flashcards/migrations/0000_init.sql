-- Editado tras generar: el schema ya existe (bootstrap doc 03) - IF NOT EXISTS lo hace inocuo.
CREATE SCHEMA IF NOT EXISTS "flashcards";
--> statement-breakpoint
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
CREATE TYPE "flashcards"."estado_mazo" AS ENUM('GENERANDO', 'EN_REVISION', 'PUBLICADO', 'FALLIDO');--> statement-breakpoint
CREATE TYPE "flashcards"."estado_tarjeta" AS ENUM('PENDIENTE_REVISION', 'PUBLICADA', 'RECHAZADA');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flashcards"."mazos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tomo_id" uuid NOT NULL,
	"curso_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"contenido_hash" text NOT NULL,
	"estado" "flashcards"."estado_mazo" DEFAULT 'GENERANDO' NOT NULL,
	"modelo_usado" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"lecciones_fuente" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generado_at" timestamp with time zone,
	"publicado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flashcards"."processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flashcards"."repasos" (
	"usuario_id" uuid NOT NULL,
	"tarjeta_id" uuid NOT NULL,
	"visto_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acerto" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flashcards"."tarjetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mazo_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"anverso" text NOT NULL,
	"reverso" text NOT NULL,
	"estado" "flashcards"."estado_tarjeta" DEFAULT 'PENDIENTE_REVISION' NOT NULL,
	"revisada_por" uuid,
	"revisada_at" timestamp with time zone,
	"motivo_rechazo" text,
	"editada" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcards"."repasos" ADD CONSTRAINT "repasos_tarjeta_id_tarjetas_id_fk" FOREIGN KEY ("tarjeta_id") REFERENCES "flashcards"."tarjetas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcards"."tarjetas" ADD CONSTRAINT "tarjetas_mazo_id_mazos_id_fk" FOREIGN KEY ("mazo_id") REFERENCES "flashcards"."mazos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mazos_tomo_version" ON "flashcards"."mazos" USING btree ("tomo_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mazos_tomo_hash" ON "flashcards"."mazos" USING btree ("tomo_id","contenido_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repasos_pk" ON "flashcards"."repasos" USING btree ("usuario_id","tarjeta_id","visto_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tarjetas_mazo_orden" ON "flashcards"."tarjetas" USING btree ("mazo_id","orden");