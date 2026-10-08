ALTER TABLE "participant_session" ADD COLUMN "metering_started_at" timestamptz DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE participant_session SET metering_started_at = greatest(joined_at, statement_timestamp());
--> statement-breakpoint
CREATE TABLE "participant_connection_interval" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "session_id" text NOT NULL REFERENCES "participant_session"("id") ON DELETE CASCADE,
  "started_at" timestamptz NOT NULL,
  "ended_at" timestamptz,
  CONSTRAINT "participant_connection_interval_time_check" CHECK (ended_at IS NULL OR ended_at >= started_at)
);
--> statement-breakpoint
CREATE INDEX "participant_connection_interval_session_time_idx" ON "participant_connection_interval" (session_id, started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX "participant_connection_interval_open_idx" ON "participant_connection_interval" (session_id) WHERE ended_at IS NULL;
--> statement-breakpoint
INSERT INTO participant_connection_interval (session_id, started_at, ended_at)
SELECT s.id, greatest(s.joined_at, coalesce(s.reconnected_at, s.joined_at)),
  CASE WHEN s.connection_state = 'connected' AND p.left_at IS NULL AND r.ended_at IS NULL THEN NULL
    ELSE greatest(coalesce(s.reconnected_at, s.joined_at),
      least(coalesce(s.disconnected_at, p.left_at, r.ended_at, s.joined_at), p.left_at, r.ended_at)) END
FROM participant_session s
JOIN participant p ON p.id = s.participant_id
JOIN room r ON r.id = p.room_id
WHERE s.connection_state <> 'connecting';
--> statement-breakpoint
CREATE FUNCTION record_participant_session_usage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  change_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.connection_state = 'connected' THEN
      INSERT INTO participant_connection_interval (session_id, started_at)
      VALUES (NEW.id, greatest(NEW.joined_at, coalesce(NEW.reconnected_at, NEW.joined_at)));
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.connection_state = 'connected' AND NEW.connection_state <> 'connected' THEN
    change_at := coalesce(NEW.disconnected_at, statement_timestamp());
    UPDATE participant_connection_interval SET ended_at = greatest(started_at, change_at)
    WHERE session_id = NEW.id AND ended_at IS NULL;
  ELSIF OLD.connection_state <> 'connected' AND NEW.connection_state = 'connected' THEN
    INSERT INTO participant_connection_interval (session_id, started_at)
    VALUES (NEW.id, greatest(NEW.joined_at, coalesce(NEW.reconnected_at, statement_timestamp())));
  END IF;
  INSERT INTO usage_event (id, organization_id, project_id, environment_id, room_id, metric, value, occurred_at)
  SELECT 'usage_event_' || gen_random_uuid()::text, pr.organization_id, r.project_id, r.environment_id,
    r.id, delta.metric, delta.value, statement_timestamp()
  FROM participant p JOIN room r ON r.id = p.room_id JOIN project pr ON pr.id = r.project_id
  CROSS JOIN (VALUES
    ('messagesIn', greatest(0, NEW.messages_in::bigint - OLD.messages_in::bigint)),
    ('messagesOut', greatest(0, NEW.messages_out::bigint - OLD.messages_out::bigint))
  ) AS delta(metric, value)
  WHERE p.id = NEW.participant_id AND delta.value > 0;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER participant_session_usage_history
AFTER INSERT OR UPDATE OF connection_state, messages_in, messages_out ON participant_session
FOR EACH ROW EXECUTE FUNCTION record_participant_session_usage();
