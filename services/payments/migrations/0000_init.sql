-- Editado tras generar: el schema ya existe (bootstrap doc 03) - IF NOT EXISTS lo hace inocuo.
CREATE SCHEMA IF NOT EXISTS "payments";
--> statement-breakpoint
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
CREATE TYPE "payments"."estado_orden" AS ENUM('PENDIENTE', 'APROBADA', 'CAPTURADA', 'FALLIDA', 'EXPIRADA', 'REEMBOLSADA');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments"."ordenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"curso_id" uuid NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"moneda" char(3) NOT NULL,
	"version_precio" integer NOT NULL,
	"estado" "payments"."estado_orden" DEFAULT 'PENDIENTE' NOT NULL,
	"paypal_order_id" text,
	"paypal_capture_id" text,
	"comision" numeric(12, 2),
	"neto" numeric(12, 2),
	"expira_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ordenes_paypal_order_id_unique" UNIQUE("paypal_order_id"),
	CONSTRAINT "ordenes_paypal_capture_id_unique" UNIQUE("paypal_capture_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments"."precios_proyeccion" (
	"curso_id" uuid PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"moneda" char(3) NOT NULL,
	"version_precio" integer NOT NULL,
	"publicado" boolean NOT NULL,
	"actualizado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments"."processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments"."reembolsos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orden_id" uuid NOT NULL,
	"paypal_refund_id" text NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"motivo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reembolsos_paypal_refund_id_unique" UNIQUE("paypal_refund_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments"."webhooks_paypal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paypal_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"firma_valida" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"recibido_at" timestamp with time zone DEFAULT now() NOT NULL,
	"procesado_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments"."reembolsos" ADD CONSTRAINT "reembolsos_orden_id_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "payments"."ordenes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhooks_paypal_event_id" ON "payments"."webhooks_paypal" USING btree ("paypal_event_id");