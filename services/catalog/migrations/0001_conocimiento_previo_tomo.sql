ALTER TYPE "catalog"."uso_banco" ADD VALUE IF NOT EXISTS 'CONOCIMIENTO_PREVIO_TOMO';
--> statement-breakpoint
ALTER TABLE "catalog"."tomos"
  ADD COLUMN IF NOT EXISTS "objetivos" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "catalog"."materiales"
  ADD COLUMN IF NOT EXISTS "enfoques" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "texto_extraido" text;
