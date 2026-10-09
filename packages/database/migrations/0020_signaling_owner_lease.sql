CREATE TABLE signaling_node_lease (
 id text PRIMARY KEY CHECK (id = 'owner'),
 node_id text NOT NULL,
 instance_id text NOT NULL,
 heartbeat_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE participant_session ADD COLUMN signaling_instance_id text;
CREATE INDEX participant_session_instance_state_idx ON participant_session (signaling_instance_id, connection_state);

CREATE FUNCTION reconcile_signaling_sessions(takeover_instance text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE affected integer;
BEGIN
 WITH stale AS (
  SELECT DISTINCT p.room_id FROM participant_session s JOIN participant p ON p.id = s.participant_id
  WHERE s.connection_state IN ('connecting', 'connected', 'reconnecting') AND (
   (takeover_instance IS NOT NULL AND s.signaling_instance_id IS DISTINCT FROM takeover_instance)
   OR (s.signaling_instance_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM signaling_node_lease l WHERE l.instance_id = s.signaling_instance_id AND l.expires_at > now()
   ))
  )
 ) UPDATE room r SET status = 'ended', ended_at = coalesce(r.ended_at, now())
 FROM stale WHERE r.id = stale.room_id;
 GET DIAGNOSTICS affected = ROW_COUNT;
 RETURN affected;
END $$;

CREATE FUNCTION require_signaling_session_lease() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.signaling_instance_id IS NOT NULL AND NEW.connection_state IN ('connecting', 'connected', 'reconnecting') THEN
  PERFORM 1 FROM signaling_node_lease WHERE id = 'owner' AND instance_id = NEW.signaling_instance_id
   AND node_id = NEW.signaling_node_id AND expires_at > now() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signaling owner lease expired' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER participant_session_owner_guard BEFORE INSERT OR UPDATE OF connection_state, signaling_node_id, signaling_instance_id
 ON participant_session FOR EACH ROW EXECUTE FUNCTION require_signaling_session_lease();
