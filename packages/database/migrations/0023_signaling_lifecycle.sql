LOCK TABLE room, participant, participant_session, participant_connection_interval, signaling_node_lease, usage_history_room, usage_history_session, usage_history_interval IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE usage_history_session ADD COLUMN owner_expires_at timestamptz;
ALTER TABLE usage_history_room ADD COLUMN owner_expires_at timestamptz;
ALTER TABLE usage_history_room ADD COLUMN owner_instance_id text;

CREATE TABLE usage_lifecycle_event (
 id text PRIMARY KEY,
 organization_id text NOT NULL,
 project_id text NOT NULL,
 environment_id text NOT NULL,
 room_id text NOT NULL,
 session_id text,
 participant_id text,
 event_type text NOT NULL CHECK (event_type IN ('room.created', 'room.started', 'room.ended', 'session.created', 'connection.opened', 'connection.closed', 'participant.left')),
 occurred_at timestamptz NOT NULL,
 boundary text NOT NULL DEFAULT 'observed' CHECK (boundary IN ('observed', 'lease_bound', 'legacy')),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_lifecycle_scope_time_idx ON usage_lifecycle_event (organization_id, project_id, environment_id, occurred_at);
CREATE INDEX usage_lifecycle_retention_idx ON usage_lifecycle_event (occurred_at);
CREATE TRIGGER usage_lifecycle_scope BEFORE INSERT OR UPDATE ON usage_lifecycle_event FOR EACH ROW EXECUTE FUNCTION validate_retained_usage_scope();

CREATE FUNCTION record_usage_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_room text; target_session text; target_participant text; source_id text; event_kind text; event_at timestamptz; event_boundary text := 'observed';
BEGIN
 IF TG_TABLE_NAME = 'usage_history_room' THEN
  target_room := NEW.id;
  source_id := NEW.id;
  IF TG_OP = 'INSERT' THEN
   INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, event_type, occurred_at)
   VALUES ('room.created:' || NEW.id, NEW.organization_id, NEW.project_id, NEW.environment_id, NEW.id, 'room.created', NEW.created_at)
   ON CONFLICT (id) DO UPDATE SET occurred_at = EXCLUDED.occurred_at;
  END IF;
  IF NEW.started_at IS NOT NULL THEN
   INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, event_type, occurred_at)
   VALUES ('room.started:' || NEW.id, NEW.organization_id, NEW.project_id, NEW.environment_id, NEW.id, 'room.started', NEW.started_at)
   ON CONFLICT (id) DO UPDATE SET occurred_at = EXCLUDED.occurred_at;
  END IF;
  event_kind := 'room.ended';
  event_at := NEW.ended_at;
  IF NEW.owner_expires_at IS NOT NULL AND event_at >= NEW.owner_expires_at THEN
   event_boundary := 'lease_bound';
   event_at := greatest(coalesce(NEW.started_at, NEW.created_at), NEW.owner_expires_at);
  END IF;
 ELSIF TG_TABLE_NAME = 'usage_history_session' THEN
  target_room := NEW.room_id;
  target_session := NEW.id;
  target_participant := NEW.participant_id;
  IF TG_OP = 'INSERT' THEN
   INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, session_id, participant_id, event_type, occurred_at)
   SELECT 'session.created:' || NEW.id, r.organization_id, r.project_id, r.environment_id, r.id, NEW.id, NEW.participant_id, 'session.created', NEW.joined_at
   FROM usage_history_room r WHERE r.id = NEW.room_id;
  END IF;
  source_id := NEW.participant_id;
  event_kind := 'participant.left';
  event_at := NEW.left_at;
  IF NEW.owner_expires_at IS NOT NULL AND event_at >= NEW.owner_expires_at THEN
   event_boundary := 'lease_bound';
   event_at := greatest(NEW.joined_at, NEW.owner_expires_at);
  END IF;
 ELSE
  SELECT room_id, id, participant_id INTO target_room, target_session, target_participant FROM usage_history_session WHERE id = NEW.session_id;
  IF target_room IS NULL THEN
   SELECT p.room_id, s.id, s.participant_id INTO target_room, target_session, target_participant FROM participant_session s JOIN participant p ON p.id = s.participant_id WHERE s.id = NEW.session_id;
  END IF;
  source_id := NEW.id;
  INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, session_id, participant_id, event_type, occurred_at)
  SELECT 'connection.opened:' || NEW.id, r.organization_id, r.project_id, r.environment_id, r.id, target_session, target_participant, 'connection.opened', NEW.started_at
  FROM usage_history_room r WHERE r.id = target_room
  ON CONFLICT (id) DO UPDATE SET occurred_at = EXCLUDED.occurred_at;
  event_kind := 'connection.closed';
  event_at := NEW.ended_at;
  IF EXISTS (SELECT 1 FROM usage_history_session WHERE id = NEW.session_id AND owner_expires_at <= event_at) THEN
   event_boundary := 'lease_bound';
   SELECT greatest(NEW.started_at, owner_expires_at) INTO event_at FROM usage_history_session WHERE id = NEW.session_id;
  END IF;
 END IF;
 IF event_at IS NOT NULL THEN
  INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, session_id, participant_id, event_type, occurred_at, boundary)
  SELECT event_kind || ':' || source_id, r.organization_id, r.project_id, r.environment_id, r.id, target_session, target_participant, event_kind, event_at, event_boundary
  FROM usage_history_room r WHERE r.id = target_room
  ON CONFLICT (id) DO UPDATE SET occurred_at = EXCLUDED.occurred_at, boundary = EXCLUDED.boundary;
 END IF;
 RETURN NEW;
END $$;

INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, event_type, occurred_at, boundary)
SELECT event_type || ':' || r.id, r.organization_id, r.project_id, r.environment_id, r.id, event_type, occurred_at, 'legacy'
FROM usage_history_room r CROSS JOIN LATERAL (VALUES ('room.created', r.created_at), ('room.started', r.started_at), ('room.ended', r.ended_at)) e(event_type, occurred_at)
WHERE occurred_at IS NOT NULL;
INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, session_id, participant_id, event_type, occurred_at, boundary)
SELECT 'session.created:' || s.id, r.organization_id, r.project_id, r.environment_id, r.id, s.id, s.participant_id, 'session.created', s.joined_at, 'legacy'
FROM usage_history_session s JOIN usage_history_room r ON r.id = s.room_id;
INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, session_id, participant_id, event_type, occurred_at, boundary)
SELECT event_type || ':' || i.id, r.organization_id, r.project_id, r.environment_id, r.id, s.id, s.participant_id, event_type, occurred_at, 'legacy'
FROM usage_history_interval i JOIN usage_history_session s ON s.id = i.session_id JOIN usage_history_room r ON r.id = s.room_id
CROSS JOIN LATERAL (VALUES ('connection.opened', i.started_at), ('connection.closed', i.ended_at)) e(event_type, occurred_at)
WHERE occurred_at IS NOT NULL;
INSERT INTO usage_lifecycle_event (id, organization_id, project_id, environment_id, room_id, participant_id, event_type, occurred_at, boundary)
SELECT DISTINCT ON (s.participant_id) 'participant.left:' || s.participant_id, r.organization_id, r.project_id, r.environment_id, r.id, s.participant_id, 'participant.left', s.left_at, 'legacy'
FROM usage_history_session s JOIN usage_history_room r ON r.id = s.room_id WHERE s.left_at IS NOT NULL ORDER BY s.participant_id, s.left_at;

CREATE TRIGGER usage_room_lifecycle AFTER INSERT OR UPDATE OF started_at, ended_at ON usage_history_room FOR EACH ROW EXECUTE FUNCTION record_usage_lifecycle();
CREATE TRIGGER usage_session_lifecycle AFTER INSERT OR UPDATE OF left_at ON usage_history_session FOR EACH ROW EXECUTE FUNCTION record_usage_lifecycle();
CREATE TRIGGER usage_connection_lifecycle AFTER INSERT OR UPDATE OF ended_at ON usage_history_interval FOR EACH ROW EXECUTE FUNCTION record_usage_lifecycle();

CREATE FUNCTION retain_usage_owner_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expiry timestamptz;
BEGIN
 SELECT expires_at INTO expiry FROM signaling_node_lease WHERE instance_id = NEW.signaling_instance_id;
 UPDATE usage_history_session SET owner_expires_at = coalesce(expiry, owner_expires_at) WHERE id = NEW.id;
 UPDATE usage_history_room SET owner_expires_at = expiry, owner_instance_id = NEW.signaling_instance_id
 WHERE id = (SELECT room_id FROM participant WHERE id = NEW.participant_id) AND expiry IS NOT NULL AND ended_at IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER zzz_usage_owner_boundary AFTER INSERT OR UPDATE OF signaling_instance_id, connection_state ON participant_session FOR EACH ROW EXECUTE FUNCTION retain_usage_owner_boundary();

CREATE FUNCTION checkpoint_usage_owner_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE usage_history_session h SET owner_expires_at = NEW.expires_at FROM participant_session s
 WHERE h.id = s.id AND s.signaling_instance_id = NEW.instance_id AND s.connection_state IN ('connecting', 'connected', 'reconnecting');
 UPDATE usage_history_room h SET owner_expires_at = NEW.expires_at WHERE h.owner_instance_id = NEW.instance_id AND h.ended_at IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER signaling_usage_owner_checkpoint AFTER INSERT OR UPDATE OF expires_at ON signaling_node_lease FOR EACH ROW EXECUTE FUNCTION checkpoint_usage_owner_boundary();
UPDATE usage_history_room h SET owner_instance_id = s.signaling_instance_id, owner_expires_at = l.expires_at
FROM participant p JOIN participant_session s ON s.participant_id = p.id JOIN signaling_node_lease l ON l.instance_id = s.signaling_instance_id
WHERE h.id = p.room_id AND h.ended_at IS NULL;
UPDATE signaling_node_lease SET expires_at = expires_at;

CREATE OR REPLACE FUNCTION reconcile_signaling_sessions(takeover_instance text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE affected integer;
BEGIN
 WITH stale_sessions AS (
  SELECT p.room_id, min(least(now(), coalesce(h.owner_expires_at, now()))) AS boundary
  FROM participant_session s JOIN participant p ON p.id = s.participant_id JOIN usage_history_session h ON h.id = s.id
  WHERE s.connection_state IN ('connecting', 'connected', 'reconnecting') AND (
   (takeover_instance IS NOT NULL AND s.signaling_instance_id IS DISTINCT FROM takeover_instance)
   OR (s.signaling_instance_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM signaling_node_lease l WHERE l.instance_id = s.signaling_instance_id AND l.expires_at > now()
   ))
  ) GROUP BY p.room_id
 ), stale AS (
  SELECT room_id, min(boundary) AS boundary FROM (
   SELECT room_id, boundary FROM stale_sessions
   UNION ALL
   SELECT h.id, least(now(), h.owner_expires_at) FROM usage_history_room h
   WHERE h.ended_at IS NULL AND h.owner_instance_id IS NOT NULL AND (
    (takeover_instance IS NOT NULL AND h.owner_instance_id IS DISTINCT FROM takeover_instance)
    OR h.owner_expires_at <= now()
   )
  ) boundaries GROUP BY room_id
 ) UPDATE room r SET status = 'ended', ended_at = coalesce(r.ended_at, greatest(coalesce(r.started_at, r.created_at), stale.boundary))
 FROM stale WHERE r.id = stale.room_id;
 GET DIAGNOSTICS affected = ROW_COUNT;
 RETURN affected;
END $$;
