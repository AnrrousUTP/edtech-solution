-- Bootstrap de schemas y roles (doc 03 §1). Corre una vez al inicializar el volumen
-- de Postgres local. En AWS lo ejecuta el módulo database/ con el usuario maestro.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

REVOKE ALL ON DATABASE edtech FROM PUBLIC;

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['identity','catalog','enrollment','gamification','flashcards','payments'] LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', s);
    BEGIN
      EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', 'svc_' || s, 'local');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO %I', s, 'svc_' || s);
    -- A-05: public va en el search_path por los tipos de extensión (citext)
    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', 'svc_' || s, s);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', s);
    EXECUTE format('GRANT CONNECT ON DATABASE edtech TO %I', 'svc_' || s);
  END LOOP;
END $$;
