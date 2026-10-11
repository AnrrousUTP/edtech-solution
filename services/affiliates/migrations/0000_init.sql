CREATE TABLE IF NOT EXISTS affiliates.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid NOT NULL UNIQUE,
  ref_id text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18),'hex'), activo boolean NOT NULL DEFAULT true,
  curso_slug text, creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliates.referral_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), afiliado_id uuid NOT NULL REFERENCES affiliates.affiliates(id),
  usuario_id uuid, creado_at timestamptz NOT NULL DEFAULT now(), expira_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
);
CREATE INDEX IF NOT EXISTS visitas_afiliado_fecha ON affiliates.referral_visits(afiliado_id,creado_at);
CREATE TABLE IF NOT EXISTS affiliates.buyer_attributions (
  usuario_id uuid PRIMARY KEY, visita_id uuid NOT NULL REFERENCES affiliates.referral_visits(id), actualizado_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliates.course_projection (
  curso_id uuid PRIMARY KEY, titulo text NOT NULL, slug text NOT NULL, publicado boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS affiliates.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), orden_id uuid NOT NULL UNIQUE,
  afiliado_id uuid NOT NULL REFERENCES affiliates.affiliates(id), curso_id uuid NOT NULL, curso_titulo text NOT NULL,
  base_centavos bigint NOT NULL CHECK(base_centavos>0), tasa_bps integer NOT NULL CHECK(tasa_bps=500),
  original_centavos bigint NOT NULL CHECK(original_centavos>=0), neto_centavos bigint NOT NULL CHECK(neto_centavos>=0),
  moneda text NOT NULL CHECK(moneda='USD'), politica text NOT NULL, creado_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS comisiones_afiliado_fecha ON affiliates.commissions(afiliado_id,creado_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS affiliates.refunds (
  reembolso_id text PRIMARY KEY, orden_id uuid NOT NULL, centavos bigint NOT NULL CHECK(centavos>=0), creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reembolsos_orden ON affiliates.refunds(orden_id);
CREATE TABLE IF NOT EXISTS affiliates.commission_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), orden_id uuid NOT NULL, referencia text NOT NULL UNIQUE,
  centavos bigint NOT NULL, tipo text NOT NULL, creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliates.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid NOT NULL, orden_id uuid,
  referencia text NOT NULL UNIQUE, mensaje text NOT NULL, leida boolean NOT NULL DEFAULT false, creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificaciones_usuario_fecha ON affiliates.notifications(usuario_id,creado_at DESC);
CREATE TABLE IF NOT EXISTS affiliates.processed_events (event_id uuid PRIMARY KEY,event_type text NOT NULL,processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS affiliates.outbox (
  event_id uuid PRIMARY KEY, event_type text NOT NULL, aggregate_id text NOT NULL, payload jsonb NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(), publicado_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_pendiente ON affiliates.outbox(creado_at) WHERE publicado_at IS NULL;
