-- Editado tras generar: el schema ya existe (bootstrap doc 03) - IF NOT EXISTS lo hace inocuo.
CREATE SCHEMA IF NOT EXISTS "catalog";
--> statement-breakpoint
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
CREATE TYPE "catalog"."estado_pub" AS ENUM('BORRADOR', 'PUBLICADO', 'DESPUBLICADO');--> statement-breakpoint
CREATE TYPE "catalog"."tipo_bloque" AS ENUM('TEXTO', 'CODIGO', 'VIDEO', 'IMAGEN', 'CALLOUT');--> statement-breakpoint
CREATE TYPE "catalog"."tipo_pregunta" AS ENUM('OPCION_UNICA', 'OPCION_MULTIPLE', 'CODIGO', 'VERDADERO_FALSO');--> statement-breakpoint
CREATE TYPE "catalog"."uso_banco" AS ENUM('NIVELACION', 'EVALUACION_TOMO', 'DIAGNOSTICO_PREVIO');--> statement-breakpoint
ALTER TYPE "catalog"."uso_banco" ADD VALUE IF NOT EXISTS 'REFUERZO';--> statement-breakpoint
ALTER TYPE "catalog"."uso_banco" ADD VALUE IF NOT EXISTS 'EVALUACION_INICIAL';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."bancos_pregunta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uso" "catalog"."uso_banco" NOT NULL,
	"tomo_id" uuid,
	"titulo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."bloques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leccion_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"tipo" "catalog"."tipo_bloque" NOT NULL,
	"contenido" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."carrera_cursos" (
	"carrera_id" uuid NOT NULL,
	"curso_id" uuid NOT NULL,
	"orden" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."carreras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text NOT NULL,
	"imagen_url" text,
	"estado" "catalog"."estado_pub" DEFAULT 'BORRADOR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "carreras_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."cursos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text NOT NULL,
	"tecnologia" text NOT NULL,
	"nivel_min" char(1) NOT NULL,
	"nivel_max" char(1) NOT NULL,
	"precio" numeric(12, 2) DEFAULT '0' NOT NULL,
	"moneda" char(3) DEFAULT 'USD' NOT NULL,
	"version_precio" integer DEFAULT 1 NOT NULL,
	"imagen_url" text,
	"estado" "catalog"."estado_pub" DEFAULT 'BORRADOR' NOT NULL,
	"publicado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "cursos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "catalog"."bancos_pregunta" ADD COLUMN IF NOT EXISTS "curso_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."ejercicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leccion_id" uuid NOT NULL,
	"enunciado" text NOT NULL,
	"solucion_esperada" jsonb NOT NULL,
	"pistas" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."lecciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tomo_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"titulo" text NOT NULL,
	"duracion_min" integer DEFAULT 10 NOT NULL,
	"contenido_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."preguntas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"banco_id" uuid NOT NULL,
	"tipo" "catalog"."tipo_pregunta" NOT NULL,
	"nivel" char(1),
	"enunciado" text NOT NULL,
	"opciones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"respuesta_correcta" jsonb NOT NULL,
	"puntaje" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."tomos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"umbral_aprobacion" integer DEFAULT 70 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."bancos_pregunta" ADD CONSTRAINT "bancos_pregunta_tomo_id_tomos_id_fk" FOREIGN KEY ("tomo_id") REFERENCES "catalog"."tomos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."bancos_pregunta" ADD CONSTRAINT "bancos_pregunta_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "catalog"."cursos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."bloques" ADD CONSTRAINT "bloques_leccion_id_lecciones_id_fk" FOREIGN KEY ("leccion_id") REFERENCES "catalog"."lecciones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."carrera_cursos" ADD CONSTRAINT "carrera_cursos_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "catalog"."carreras"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."carrera_cursos" ADD CONSTRAINT "carrera_cursos_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "catalog"."cursos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."ejercicios" ADD CONSTRAINT "ejercicios_leccion_id_lecciones_id_fk" FOREIGN KEY ("leccion_id") REFERENCES "catalog"."lecciones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."lecciones" ADD CONSTRAINT "lecciones_tomo_id_tomos_id_fk" FOREIGN KEY ("tomo_id") REFERENCES "catalog"."tomos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."preguntas" ADD CONSTRAINT "preguntas_banco_id_bancos_pregunta_id_fk" FOREIGN KEY ("banco_id") REFERENCES "catalog"."bancos_pregunta"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."tomos" ADD CONSTRAINT "tomos_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "catalog"."cursos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "carrera_cursos_pk" ON "catalog"."carrera_cursos" USING btree ("carrera_id","curso_id");
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "catalog"."tipo_material" AS ENUM('PDF', 'ENLACE', 'VIDEO', 'DOCUMENTO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."materiales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tomo_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"tipo" "catalog"."tipo_material" NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog"."materiales" ADD CONSTRAINT "materiales_tomo_id_tomos_id_fk" FOREIGN KEY ("tomo_id") REFERENCES "catalog"."tomos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "materiales_tomo_orden" ON "catalog"."materiales" USING btree ("tomo_id","orden");
