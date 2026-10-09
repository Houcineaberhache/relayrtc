LOCK TABLE room, participant, participant_session, participant_connection_interval, signaling_node_lease, usage_history_room, usage_history_session, usage_history_interval, usage_event, usage_lifecycle_event IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE usage_aggregate ADD COLUMN source_through_at timestamptz;
ALTER TABLE usage_aggregate ADD COLUMN data_quality jsonb NOT NULL DEFAULT '{}';
ALTER TABLE usage_aggregate ADD CONSTRAINT usage_aggregate_canonical_scope_idx UNIQUE NULLS NOT DISTINCT (organization_id, project_id, environment_id, granularity, window_started_at);

CREATE TABLE usage_aggregation_dirty (
 organization_id text NOT NULL,
 hour_started_at timestamptz NOT NULL,
 queued_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, hour_started_at)
);
CREATE INDEX usage_aggregation_dirty_due_idx ON usage_aggregation_dirty (hour_started_at, queued_at);
CREATE TABLE usage_aggregation_checkpoint (
 organization_id text PRIMARY KEY,
 scheduled_through_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz,
 processed_hours bigint NOT NULL DEFAULT 0
);

CREATE FUNCTION queue_usage_aggregation(organization_key text, starts timestamptz, ends timestamptz) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF organization_key IS NULL OR starts IS NULL THEN RETURN; END IF;
 INSERT INTO usage_aggregation_checkpoint (organization_id) VALUES (organization_key) ON CONFLICT DO NOTHING;
 INSERT INTO usage_aggregation_dirty (organization_id, hour_started_at)
 SELECT organization_key, at FROM generate_series(
  date_trunc('hour', greatest(starts, statement_timestamp() - interval '3650 days') AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
  date_trunc('hour', greatest(starts, coalesce(ends, statement_timestamp())) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', interval '1 hour'
 ) at WHERE at <= statement_timestamp()
 ON CONFLICT (organization_id, hour_started_at) DO UPDATE SET queued_at = least(usage_aggregation_dirty.queued_at, EXCLUDED.queued_at);
END $$;

CREATE FUNCTION invalidate_usage_aggregation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE organization_key text; target_room text; starts timestamptz; ends timestamptz;
BEGIN
 IF TG_TABLE_NAME IN ('usage_event', 'usage_lifecycle_event') THEN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  PERFORM queue_usage_aggregation(NEW.organization_id, NEW.occurred_at, NEW.occurred_at);
  IF TG_OP = 'UPDATE' THEN PERFORM queue_usage_aggregation(OLD.organization_id, OLD.occurred_at, OLD.occurred_at); END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME = 'usage_history_room' THEN
  IF TG_OP = 'UPDATE' AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND NEW.started_at IS NOT DISTINCT FROM OLD.started_at
   AND NEW.ended_at IS NOT DISTINCT FROM OLD.ended_at AND NEW.status = OLD.status
   AND least(NEW.owner_expires_at, statement_timestamp()) IS NOT DISTINCT FROM least(OLD.owner_expires_at, statement_timestamp()) THEN RETURN NEW; END IF;
  organization_key := NEW.organization_id;
  starts := least(NEW.created_at, NEW.started_at);
  ends := least(NEW.ended_at, NEW.owner_expires_at, statement_timestamp());
  IF TG_OP = 'UPDATE' THEN starts := least(starts, OLD.created_at, OLD.started_at); ends := greatest(ends, least(OLD.ended_at, OLD.owner_expires_at, statement_timestamp())); END IF;
 ELSIF TG_TABLE_NAME = 'usage_history_session' THEN
  IF TG_OP = 'UPDATE' AND NEW.left_at IS NOT DISTINCT FROM OLD.left_at AND NEW.metering_started_at = OLD.metering_started_at
   AND NEW.connection_state = OLD.connection_state AND NEW.disconnected_at IS NOT DISTINCT FROM OLD.disconnected_at
   AND least(NEW.owner_expires_at, statement_timestamp()) IS NOT DISTINCT FROM least(OLD.owner_expires_at, statement_timestamp()) THEN RETURN NEW; END IF;
  target_room := NEW.room_id;
  starts := NEW.joined_at;
  ends := least(NEW.left_at, NEW.owner_expires_at, statement_timestamp());
  IF TG_OP = 'UPDATE' THEN starts := least(starts, OLD.joined_at); ends := greatest(ends, least(OLD.left_at, OLD.owner_expires_at, statement_timestamp())); END IF;
 ELSE
  IF TG_OP = 'UPDATE' AND NEW.started_at IS NOT DISTINCT FROM OLD.started_at AND NEW.ended_at IS NOT DISTINCT FROM OLD.ended_at THEN RETURN NEW; END IF;
  SELECT room_id INTO target_room FROM usage_history_session WHERE id = NEW.session_id;
  IF target_room IS NULL THEN SELECT p.room_id INTO target_room FROM participant_session s JOIN participant p ON p.id = s.participant_id WHERE s.id = NEW.session_id; END IF;
  starts := NEW.started_at;
  ends := least(NEW.ended_at, statement_timestamp());
  IF TG_OP = 'UPDATE' THEN starts := least(starts, OLD.started_at); ends := greatest(ends, least(OLD.ended_at, statement_timestamp())); END IF;
 END IF;
 IF organization_key IS NULL THEN SELECT organization_id INTO organization_key FROM usage_history_room WHERE id = target_room; END IF;
 PERFORM queue_usage_aggregation(organization_key, starts, ends);
 RETURN NEW;
END $$;
CREATE TRIGGER usage_event_aggregation_dirty AFTER INSERT OR UPDATE ON usage_event FOR EACH ROW EXECUTE FUNCTION invalidate_usage_aggregation();
CREATE TRIGGER usage_lifecycle_aggregation_dirty AFTER INSERT OR UPDATE ON usage_lifecycle_event FOR EACH ROW EXECUTE FUNCTION invalidate_usage_aggregation();
CREATE TRIGGER usage_room_aggregation_dirty AFTER INSERT OR UPDATE ON usage_history_room FOR EACH ROW EXECUTE FUNCTION invalidate_usage_aggregation();
CREATE TRIGGER usage_session_aggregation_dirty AFTER INSERT OR UPDATE ON usage_history_session FOR EACH ROW EXECUTE FUNCTION invalidate_usage_aggregation();
CREATE TRIGGER usage_interval_aggregation_dirty AFTER INSERT OR UPDATE ON usage_history_interval FOR EACH ROW EXECUTE FUNCTION invalidate_usage_aggregation();

INSERT INTO usage_aggregation_checkpoint (organization_id) SELECT id FROM usage_history_organization;
DO $$
DECLARE source record;
BEGIN
 FOR source IN SELECT organization_id, occurred_at FROM usage_event UNION SELECT organization_id, occurred_at FROM usage_lifecycle_event LOOP
  PERFORM queue_usage_aggregation(source.organization_id, source.occurred_at, source.occurred_at);
 END LOOP;
 FOR source IN SELECT organization_id, coalesce(started_at, created_at) AS starts, least(ended_at, owner_expires_at, now()) AS ends
 FROM usage_history_room WHERE started_at IS NOT NULL LOOP
  PERFORM queue_usage_aggregation(source.organization_id, source.starts, source.ends);
 END LOOP;
 FOR source IN SELECT r.organization_id, i.started_at AS starts, least(i.ended_at, s.left_at, s.owner_expires_at, r.ended_at, now()) AS ends
 FROM usage_history_interval i JOIN usage_history_session s ON s.id = i.session_id JOIN usage_history_room r ON r.id = s.room_id LOOP
  PERFORM queue_usage_aggregation(source.organization_id, source.starts, source.ends);
 END LOOP;
END $$;
