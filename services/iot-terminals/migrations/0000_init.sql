CREATE TABLE IF NOT EXISTS iot_terminals.affiliate_projection (usuario_id uuid PRIMARY KEY,afiliado_id uuid NOT NULL,ref_id text NOT NULL);
CREATE TABLE IF NOT EXISTS iot_terminals.terminal_requests (usuario_id uuid PRIMARY KEY,creado_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS iot_terminals.terminals (
  id text PRIMARY KEY,usuario_id uuid,ref_id text,mensaje text NOT NULL DEFAULT 'Aprende algo nuevo con EdTech',
  habilitado boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 0,version_reportada integer NOT NULL DEFAULT 0,
  ultima_conexion timestamptz,ultimo_aviso text,preview_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex')
);
CREATE TABLE IF NOT EXISTS iot_terminals.terminal_alerts (
  id uuid PRIMARY KEY,terminal_id text NOT NULL REFERENCES iot_terminals.terminals(id),orden_id uuid NOT NULL,
  texto text NOT NULL,creado_at timestamptz NOT NULL DEFAULT now(),ack_at timestamptz,
  UNIQUE(terminal_id,orden_id)
);
CREATE INDEX IF NOT EXISTS avisos_pendientes ON iot_terminals.terminal_alerts(terminal_id,creado_at) WHERE ack_at IS NULL;
CREATE TABLE IF NOT EXISTS iot_terminals.processed_events (event_id uuid PRIMARY KEY,event_type text NOT NULL,processed_at timestamptz NOT NULL DEFAULT now());
