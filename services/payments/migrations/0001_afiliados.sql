ALTER TABLE payments.ordenes ADD COLUMN IF NOT EXISTS atribucion jsonb;
ALTER TABLE payments.ordenes ADD COLUMN IF NOT EXISTS curso_titulo text NOT NULL DEFAULT '';
ALTER TABLE payments.ordenes ADD COLUMN IF NOT EXISTS reembolsos_registrados jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS payments.outbox (
  event_id uuid PRIMARY KEY, event_type text NOT NULL, aggregate_id text NOT NULL, payload jsonb NOT NULL,
  dedupe_key text NOT NULL UNIQUE, creado_at timestamptz NOT NULL DEFAULT now(), publicado_at timestamptz
);
CREATE INDEX IF NOT EXISTS payments_outbox_pendiente ON payments.outbox(creado_at) WHERE publicado_at IS NULL;
