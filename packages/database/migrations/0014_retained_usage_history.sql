LOCK TABLE organization, project, environment, room, participant, participant_session, participant_connection_interval, usage_event, usage_aggregate IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE usage_history_organization (
  id text PRIMARY KEY,
  deleted_at timestamptz
);

CREATE TABLE usage_history_project (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  created_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE INDEX usage_history_project_organization_idx ON usage_history_project (organization_id);
CREATE TABLE usage_history_environment (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  deleted_at timestamptz
);
CREATE INDEX usage_history_environment_project_idx ON usage_history_environment (project_id);
CREATE TABLE usage_history_room (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment_id text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX usage_history_room_scope_time_idx ON usage_history_room (organization_id, project_id, environment_id, created_at);
CREATE TABLE usage_history_session (
  id text PRIMARY KEY,
  participant_id text NOT NULL,
  room_id text NOT NULL,
  country text,
  connection_state text NOT NULL,
  joined_at timestamptz NOT NULL,
  disconnected_at timestamptz,
  metering_started_at timestamptz NOT NULL,
  left_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX usage_history_session_room_idx ON usage_history_session (room_id);
CREATE INDEX usage_history_session_participant_idx ON usage_history_session (participant_id);
CREATE TABLE usage_history_interval (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  CONSTRAINT usage_history_interval_time_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX usage_history_interval_session_time_idx ON usage_history_interval (session_id, started_at);
CREATE INDEX usage_history_interval_retention_idx ON usage_history_interval (ended_at);
CREATE INDEX usage_event_retention_idx ON usage_event (occurred_at);
CREATE INDEX usage_aggregate_retention_idx ON usage_aggregate (window_ended_at);

INSERT INTO usage_history_organization SELECT id, NULL FROM organization;
INSERT INTO usage_history_project SELECT id, organization_id, created_at, NULL FROM project;
INSERT INTO usage_history_environment SELECT id, project_id, NULL FROM environment;
INSERT INTO usage_history_room
SELECT r.id, p.organization_id, r.project_id, r.environment_id, r.status, r.created_at, r.started_at, r.ended_at, NULL
FROM room r JOIN project p ON p.id = r.project_id;
INSERT INTO usage_history_session
SELECT s.id, s.participant_id, p.room_id, s.country, s.connection_state, s.joined_at, s.disconnected_at,
  s.metering_started_at, p.left_at, NULL FROM participant_session s JOIN participant p ON p.id = s.participant_id;
INSERT INTO usage_history_interval SELECT id, session_id, started_at, ended_at FROM participant_connection_interval;

DO $$
BEGIN
  IF (SELECT count(*) FROM usage_history_project) <> (SELECT count(*) FROM project)
    OR (SELECT count(*) FROM usage_history_environment) <> (SELECT count(*) FROM environment)
    OR (SELECT count(*) FROM usage_history_room) <> (SELECT count(*) FROM room)
    OR (SELECT count(*) FROM usage_history_session) <> (SELECT count(*) FROM participant_session)
    OR (SELECT count(*) FROM usage_history_interval) <> (SELECT count(*) FROM participant_connection_interval) THEN
    RAISE EXCEPTION 'Accounting history backfill is incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM usage_event u
    LEFT JOIN usage_history_project p ON p.id = u.project_id
    LEFT JOIN usage_history_environment e ON e.id = u.environment_id
    LEFT JOIN usage_history_room r ON r.id = u.room_id
    WHERE p.organization_id IS DISTINCT FROM u.organization_id OR e.project_id IS DISTINCT FROM u.project_id
      OR (u.room_id IS NOT NULL AND (r.project_id IS DISTINCT FROM u.project_id OR r.environment_id IS DISTINCT FROM u.environment_id))
  ) THEN
    RAISE EXCEPTION 'Existing accounting usage scopes are inconsistent';
  END IF;
END;
$$;

ALTER TABLE usage_event DROP CONSTRAINT usage_event_organization_id_organization_id_fk;
ALTER TABLE usage_event DROP CONSTRAINT usage_event_project_id_project_id_fk;
ALTER TABLE usage_event DROP CONSTRAINT usage_event_environment_id_environment_id_fk;
ALTER TABLE usage_event DROP CONSTRAINT usage_event_room_id_room_id_fk;
ALTER TABLE usage_aggregate DROP CONSTRAINT usage_aggregate_organization_id_organization_id_fk;
ALTER TABLE usage_aggregate DROP CONSTRAINT usage_aggregate_project_id_project_id_fk;
ALTER TABLE usage_aggregate DROP CONSTRAINT usage_aggregate_environment_id_environment_id_fk;

CREATE FUNCTION retain_usage_dimension() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'organization' THEN
    IF TG_OP = 'DELETE' THEN
      UPDATE usage_history_organization SET deleted_at = statement_timestamp() WHERE id = OLD.id;
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.id <> OLD.id THEN
      RAISE EXCEPTION 'Accounting organization identity is immutable';
    END IF;
    IF TG_OP = 'INSERT' THEN
      INSERT INTO usage_history_organization (id) VALUES (NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'project' THEN
    IF TG_OP = 'DELETE' THEN
      UPDATE usage_history_project SET deleted_at = statement_timestamp() WHERE id = OLD.id;
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id) THEN
      RAISE EXCEPTION 'Accounting project identity is immutable';
    END IF;
    IF TG_OP = 'INSERT' THEN
      INSERT INTO usage_history_project (id, organization_id, created_at) VALUES (NEW.id, NEW.organization_id, NEW.created_at);
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      UPDATE usage_history_environment SET deleted_at = statement_timestamp() WHERE id = OLD.id;
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id) THEN
      RAISE EXCEPTION 'Accounting environment identity is immutable';
    END IF;
    IF TG_OP = 'INSERT' THEN
      INSERT INTO usage_history_environment (id, project_id) VALUES (NEW.id, NEW.project_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retained_usage_project AFTER INSERT OR UPDATE OR DELETE ON project FOR EACH ROW EXECUTE FUNCTION retain_usage_dimension();
CREATE TRIGGER retained_usage_organization AFTER INSERT OR UPDATE OR DELETE ON organization FOR EACH ROW EXECUTE FUNCTION retain_usage_dimension();
CREATE TRIGGER retained_usage_environment AFTER INSERT OR UPDATE OR DELETE ON environment FOR EACH ROW EXECUTE FUNCTION retain_usage_dimension();

CREATE FUNCTION retain_usage_room() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE usage_history_room SET deleted_at = statement_timestamp(), status = 'ended',
      ended_at = coalesce(ended_at, greatest(coalesce(started_at, created_at), statement_timestamp())) WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id OR NEW.environment_id <> OLD.environment_id) THEN
    RAISE EXCEPTION 'Accounting room identity is immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO usage_history_room (id, organization_id, project_id, environment_id, status, created_at, started_at, ended_at)
    SELECT NEW.id, organization_id, NEW.project_id, NEW.environment_id, NEW.status, NEW.created_at, NEW.started_at, NEW.ended_at
    FROM usage_history_project WHERE id = NEW.project_id;
  ELSE
    INSERT INTO usage_history_room (id, organization_id, project_id, environment_id, status, created_at, started_at, ended_at)
    SELECT NEW.id, organization_id, NEW.project_id, NEW.environment_id, NEW.status, NEW.created_at, NEW.started_at, NEW.ended_at
    FROM usage_history_project WHERE id = NEW.project_id
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, created_at = EXCLUDED.created_at, started_at = EXCLUDED.started_at, ended_at = EXCLUDED.ended_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retained_usage_room AFTER INSERT OR UPDATE OR DELETE ON room FOR EACH ROW EXECUTE FUNCTION retain_usage_room();

CREATE FUNCTION retain_usage_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE usage_history_session SET deleted_at = statement_timestamp(),
      disconnected_at = CASE WHEN connection_state = 'connected' THEN greatest(joined_at, statement_timestamp())
        ELSE coalesce(disconnected_at, greatest(joined_at, statement_timestamp())) END,
      connection_state = CASE WHEN connection_state = 'failed' THEN 'failed' ELSE 'disconnected' END
    WHERE id = OLD.id;
    UPDATE usage_history_interval SET ended_at = greatest(started_at, statement_timestamp()) WHERE session_id = OLD.id AND ended_at IS NULL;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.participant_id <> OLD.participant_id) THEN
    RAISE EXCEPTION 'Accounting session identity is immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO usage_history_session (id, participant_id, room_id, country, connection_state, joined_at, disconnected_at, metering_started_at, left_at)
    SELECT NEW.id, NEW.participant_id, p.room_id, NEW.country, NEW.connection_state, NEW.joined_at, NEW.disconnected_at, NEW.metering_started_at, p.left_at
    FROM participant p WHERE p.id = NEW.participant_id;
  ELSE
    INSERT INTO usage_history_session (id, participant_id, room_id, country, connection_state, joined_at, disconnected_at, metering_started_at, left_at)
    SELECT NEW.id, NEW.participant_id, p.room_id, NEW.country, NEW.connection_state, NEW.joined_at, NEW.disconnected_at,
      greatest(NEW.metering_started_at, statement_timestamp()), p.left_at FROM participant p WHERE p.id = NEW.participant_id
    ON CONFLICT (id) DO UPDATE SET country = EXCLUDED.country, connection_state = EXCLUDED.connection_state,
      joined_at = EXCLUDED.joined_at, disconnected_at = EXCLUDED.disconnected_at,
      metering_started_at = NEW.metering_started_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_retained_usage_session AFTER INSERT OR UPDATE OR DELETE ON participant_session FOR EACH ROW EXECUTE FUNCTION retain_usage_session();

CREATE FUNCTION retain_usage_interval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE usage_history_interval SET ended_at = coalesce(ended_at, greatest(started_at, statement_timestamp())) WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.session_id <> OLD.session_id) THEN
    RAISE EXCEPTION 'Accounting interval identity is immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO usage_history_interval (id, session_id, started_at, ended_at) VALUES (NEW.id, NEW.session_id, NEW.started_at, NEW.ended_at);
  ELSE
    UPDATE usage_history_interval SET started_at = NEW.started_at, ended_at = NEW.ended_at WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retained_usage_interval AFTER INSERT OR UPDATE OR DELETE ON participant_connection_interval FOR EACH ROW EXECUTE FUNCTION retain_usage_interval();

CREATE FUNCTION retain_usage_participant_end() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE usage_history_session SET left_at = coalesce(left_at, OLD.left_at, greatest(joined_at, statement_timestamp())) WHERE participant_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.id <> OLD.id OR NEW.room_id <> OLD.room_id THEN
    RAISE EXCEPTION 'Accounting participant identity is immutable';
  END IF;
  UPDATE usage_history_session SET left_at = NEW.left_at WHERE participant_id = NEW.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retained_usage_participant AFTER UPDATE OR DELETE ON participant FOR EACH ROW EXECUTE FUNCTION retain_usage_participant_end();

CREATE FUNCTION validate_retained_participant_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM usage_history_session WHERE participant_id = NEW.id)
    AND NOT EXISTS (SELECT 1 FROM participant WHERE id = NEW.id AND room_id = NEW.room_id) THEN
    RAISE EXCEPTION 'Accounting participant identity cannot be reused';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retained_usage_participant_identity BEFORE INSERT ON participant FOR EACH ROW EXECUTE FUNCTION validate_retained_participant_identity();

CREATE FUNCTION validate_retained_usage_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usage_history_project WHERE id = NEW.project_id AND organization_id = NEW.organization_id)
    OR NOT EXISTS (SELECT 1 FROM usage_history_environment WHERE id = NEW.environment_id AND project_id = NEW.project_id)
    OR (NEW.room_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usage_history_room WHERE id = NEW.room_id AND project_id = NEW.project_id AND environment_id = NEW.environment_id)) THEN
    RAISE EXCEPTION 'Invalid accounting usage scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retained_usage_event_scope BEFORE INSERT OR UPDATE ON usage_event FOR EACH ROW EXECUTE FUNCTION validate_retained_usage_scope();

CREATE FUNCTION validate_retained_aggregate_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usage_history_organization WHERE id = NEW.organization_id)
    OR (NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usage_history_project WHERE id = NEW.project_id AND organization_id = NEW.organization_id))
    OR (NEW.environment_id IS NOT NULL AND (NEW.project_id IS NULL OR NOT EXISTS (SELECT 1 FROM usage_history_environment WHERE id = NEW.environment_id AND project_id = NEW.project_id))) THEN
    RAISE EXCEPTION 'Invalid accounting aggregate scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retained_usage_aggregate_scope BEFORE INSERT OR UPDATE ON usage_aggregate FOR EACH ROW EXECUTE FUNCTION validate_retained_aggregate_scope();
