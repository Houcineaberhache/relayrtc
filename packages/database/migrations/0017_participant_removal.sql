ALTER TABLE participant ADD COLUMN removed_at timestamptz;
ALTER TABLE runtime_operation DROP CONSTRAINT runtime_operation_kind_check;
ALTER TABLE runtime_operation ADD CONSTRAINT runtime_operation_kind_check CHECK (kind IN ('room.end', 'participant.remove', 'project.delete', 'organization.delete', 'environment.delete'));

CREATE TABLE participant_removal_target (
 operation_id text NOT NULL,
 session_id text NOT NULL,
 participant_id text NOT NULL,
 room_id text NOT NULL,
 signaling_node_id text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed', 'completed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY (operation_id, session_id)
);
CREATE INDEX participant_removal_target_due_idx ON participant_removal_target (signaling_node_id, status, available_at);

CREATE FUNCTION fence_removed_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.removed_at IS NOT NULL AND NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
  RAISE EXCEPTION 'Participant removal cannot be cancelled' USING ERRCODE = '23514';
 END IF;
 IF NEW.removed_at IS NOT NULL THEN NEW.left_at := coalesce(OLD.left_at, NEW.removed_at); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER participant_removal_fence BEFORE UPDATE OF removed_at, left_at ON participant FOR EACH ROW EXECUTE FUNCTION fence_removed_participant();

CREATE FUNCTION queue_participant_removal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation_key text := 'participant.remove:' || NEW.id;
BEGIN
 IF NEW.removed_at IS NULL THEN RETURN NEW; END IF;
 INSERT INTO runtime_operation (id, kind, resource_id, organization_id, project_id, environment_id, payload)
 SELECT operation_key, 'participant.remove', NEW.id, p.organization_id, r.project_id, r.environment_id,
 jsonb_build_object('roomId', NEW.room_id, 'participantId', NEW.id)
 FROM room r JOIN project p ON p.id = r.project_id WHERE r.id = NEW.room_id
 ON CONFLICT (id) DO NOTHING;
 INSERT INTO participant_removal_target (operation_id, session_id, participant_id, room_id, signaling_node_id)
 SELECT operation_key, s.id, NEW.id, NEW.room_id, s.signaling_node_id FROM participant_session s
 WHERE s.participant_id = NEW.id AND (s.connection_state IN ('connecting', 'connected', 'reconnecting')
 OR EXISTS (SELECT 1 FROM rtc_runtime m WHERE m.room_id = NEW.room_id AND m.state->'Sessions' ? s.id))
 ON CONFLICT DO NOTHING;
 UPDATE participant_session SET connection_state = 'disconnected',
 connection_seconds = connection_seconds + CASE WHEN connection_state = 'connected'
 THEN greatest(0, extract(epoch from (NEW.removed_at - coalesce(reconnected_at, joined_at)))) ELSE 0 END,
 disconnected_at = CASE WHEN connection_state = 'connected' THEN greatest(joined_at, NEW.removed_at)
 ELSE coalesce(disconnected_at, greatest(joined_at, NEW.removed_at)) END
 WHERE participant_id = NEW.id AND connection_state <> 'disconnected';
 RETURN NEW;
END $$;
CREATE TRIGGER participant_removal_outbox AFTER UPDATE OF removed_at ON participant FOR EACH ROW EXECUTE FUNCTION queue_participant_removal();

CREATE FUNCTION require_live_participant_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revoked boolean;
BEGIN
 IF NEW.connection_state IN ('connecting', 'connected', 'reconnecting') THEN
  SELECT removed_at IS NOT NULL INTO revoked FROM participant WHERE id = NEW.participant_id FOR SHARE;
  IF revoked THEN RAISE EXCEPTION 'Participant is removed' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER participant_session_removal_guard BEFORE INSERT OR UPDATE OF participant_id, connection_state ON participant_session FOR EACH ROW EXECUTE FUNCTION require_live_participant_session();
