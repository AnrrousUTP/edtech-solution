-- Editado tras generar: el schema ya existe (bootstrap doc 03) - IF NOT EXISTS lo hace inocuo.
CREATE SCHEMA IF NOT EXISTS "gamification";
--> statement-breakpoint
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
CREATE TYPE "gamification"."criterio_insignia" AS ENUM('CURSO_COMPLETADO', 'CARRERA_COMPLETADA', 'RACHA_7', 'RACHA_30', 'RACHA_100', 'PRIMER_CURSO', 'EVALUACION_PERFECTA', 'MADRUGADOR', 'MARATON');--> statement-breakpoint
CREATE TYPE "gamification"."tipo_certificado" AS ENUM('MENOR', 'MAYOR');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gamification"."certificados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "gamification"."tipo_certificado" NOT NULL,
	"referencia_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"nombre_titular" text NOT NULL,
	"codigo_verificacion" text NOT NULL,
	"pdf_s3_key" text,
	"emitido_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificados_codigo_verificacion_unique" UNIQUE("codigo_verificacion")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gamification"."insignias_otorgadas" (
	"usuario_id" uuid NOT NULL,
	"criterio" "gamification"."criterio_insignia" NOT NULL,
	"referencia_id" uuid NOT NULL,
	"otorgada_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gamification"."perfiles" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"puntos" integer DEFAULT 0 NOT NULL,
	"racha_actual" integer DEFAULT 0 NOT NULL,
	"racha_maxima" integer DEFAULT 0 NOT NULL,
	"ultima_actividad" timestamp with time zone,
	"ultima_actividad_dia" date,
	"zona_horaria" text DEFAULT 'America/Lima' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gamification"."processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "certificados_unicidad" ON "gamification"."certificados" USING btree ("usuario_id","tipo","referencia_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "insignias_pk" ON "gamification"."insignias_otorgadas" USING btree ("usuario_id","criterio","referencia_id");