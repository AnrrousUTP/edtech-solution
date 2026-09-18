-- Editado tras generar: el schema ya existe (bootstrap doc 03) - IF NOT EXISTS lo hace inocuo.
CREATE SCHEMA IF NOT EXISTS "enrollment";
--> statement-breakpoint
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
CREATE TYPE "enrollment"."estado_intento" AS ENUM('EN_CURSO', 'ENTREGADO');--> statement-breakpoint
CREATE TYPE "enrollment"."estado_matricula" AS ENUM('ACTIVA', 'REVOCADA', 'EXPIRADA');--> statement-breakpoint
CREATE TYPE "enrollment"."origen_matricula" AS ENUM('PAGO', 'ALTA_MANUAL', 'GRATUITO');--> statement-breakpoint
CREATE TYPE "enrollment"."tipo_evaluacion" AS ENUM('NIVELACION', 'TOMO', 'DIAGNOSTICO_PREVIO');--> statement-breakpoint
ALTER TYPE "enrollment"."tipo_evaluacion" ADD VALUE IF NOT EXISTS 'REFUERZO';--> statement-breakpoint
ALTER TYPE "enrollment"."tipo_evaluacion" ADD VALUE IF NOT EXISTS 'EVALUACION_INICIAL';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment"."cursos_proyeccion" (
	"curso_id" uuid PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"slug" text NOT NULL,
	"publicado" boolean NOT NULL,
	"precio" numeric(12, 2) DEFAULT '0' NOT NULL,
	"nivel_max" char(1),
	"estructura" jsonb NOT NULL,
	"actualizado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment"."intentos_evaluacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "enrollment"."tipo_evaluacion" NOT NULL,
	"banco_id" uuid NOT NULL,
	"matricula_id" uuid,
	"tomo_id" uuid,
	"estado" "enrollment"."estado_intento" DEFAULT 'EN_CURSO' NOT NULL,
	"puntaje" integer,
	"aprobado" boolean,
	"nivel_resultante" char(1),
	"iniciado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entregado_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment"."matriculas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"curso_id" uuid NOT NULL,
	"estado" "enrollment"."estado_matricula" DEFAULT 'ACTIVA' NOT NULL,
	"origen" "enrollment"."origen_matricula" NOT NULL,
	"orden_id" uuid,
	"acceso_hasta" timestamp with time zone,
	"curso_completado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment"."processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment"."progreso_lecciones" (
	"matricula_id" uuid NOT NULL,
	"leccion_id" uuid NOT NULL,
	"tomo_id" uuid NOT NULL,
	"completada_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment"."progreso_tomos" (
	"matricula_id" uuid NOT NULL,
	"tomo_id" uuid NOT NULL,
	"completado_at" timestamp with time zone,
	"mejor_puntaje" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment"."respuestas_intento" (
	"intento_id" uuid NOT NULL,
	"pregunta_id" uuid NOT NULL,
	"respuesta" jsonb NOT NULL,
	"correcta" boolean
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment"."intentos_evaluacion" ADD CONSTRAINT "intentos_evaluacion_matricula_id_matriculas_id_fk" FOREIGN KEY ("matricula_id") REFERENCES "enrollment"."matriculas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment"."progreso_lecciones" ADD CONSTRAINT "progreso_lecciones_matricula_id_matriculas_id_fk" FOREIGN KEY ("matricula_id") REFERENCES "enrollment"."matriculas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment"."progreso_tomos" ADD CONSTRAINT "progreso_tomos_matricula_id_matriculas_id_fk" FOREIGN KEY ("matricula_id") REFERENCES "enrollment"."matriculas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment"."respuestas_intento" ADD CONSTRAINT "respuestas_intento_intento_id_intentos_evaluacion_id_fk" FOREIGN KEY ("intento_id") REFERENCES "enrollment"."intentos_evaluacion"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "matriculas_usuario_curso" ON "enrollment"."matriculas" USING btree ("usuario_id","curso_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "progreso_lecciones_pk" ON "enrollment"."progreso_lecciones" USING btree ("matricula_id","leccion_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "progreso_tomos_pk" ON "enrollment"."progreso_tomos" USING btree ("matricula_id","tomo_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "respuestas_intento_pk" ON "enrollment"."respuestas_intento" USING btree ("intento_id","pregunta_id");
