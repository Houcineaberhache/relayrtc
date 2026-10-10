CREATE TABLE webhook_event (
 id text PRIMARY KEY,
 source_key text NOT NULL,
 project_id text NOT NULL,
 environment_id text NOT NULL,
 event_type text NOT NULL CHECK (event_type IN ('room.created', 'room.started', 'room.ended', 'participant.joined', 'participant.left', 'participant.reconnected', 'track.published', 'track.unpublished', 'connection.degraded', 'connection.recovered')),
 occurred_at timestamptz NOT NULL,
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 1048576),
 body text NOT NULL CHECK (octet_length(body) <= 1048576),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (project_id, environment_id, source_key),
 UNIQUE (id, project_id, environment_id)
);
CREATE INDEX webhook_event_retention_idx ON webhook_event (recorded_at);

CREATE FUNCTION reject_webhook_event_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Webhook events are immutable';
END $$;
CREATE TRIGGER webhook_event_immutable BEFORE UPDATE ON webhook_event FOR EACH ROW EXECUTE FUNCTION reject_webhook_event_update();

CREATE TABLE webhook_delivery (
 id text PRIMARY KEY DEFAULT 'delivery_' || gen_random_uuid()::text,
 event_id text NOT NULL,
 endpoint_id text NOT NULL,
 project_id text NOT NULL,
 environment_id text NOT NULL,
 url text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'succeeded', 'failed', 'cancelled')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
 run_attempt_count integer NOT NULL DEFAULT 0 CHECK (run_attempt_count BETWEEN 0 AND 8),
 replay_count integer NOT NULL DEFAULT 0 CHECK (replay_count BETWEEN 0 AND 100),
 next_attempt_at timestamptz DEFAULT now(),
 lease_token text,
 leased_until timestamptz,
 last_error text,
 delivered_at timestamptz,
 run_started_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (event_id, endpoint_id),
 FOREIGN KEY (event_id, project_id, environment_id) REFERENCES webhook_event(id, project_id, environment_id) ON DELETE CASCADE,
 CHECK ((status = 'delivering' AND lease_token IS NOT NULL AND leased_until IS NOT NULL) OR (status <> 'delivering' AND lease_token IS NULL AND leased_until IS NULL))
);
CREATE INDEX webhook_delivery_due_idx ON webhook_delivery (next_attempt_at, created_at) WHERE status = 'pending';
CREATE INDEX webhook_delivery_lease_idx ON webhook_delivery (leased_until) WHERE status = 'delivering';
CREATE INDEX webhook_delivery_scope_idx ON webhook_delivery (project_id, environment_id, endpoint_id, created_at DESC, id DESC);
CREATE INDEX webhook_delivery_retention_idx ON webhook_delivery (updated_at) WHERE status IN ('succeeded', 'failed', 'cancelled');

CREATE TABLE webhook_delivery_attempt (
 id text PRIMARY KEY,
 delivery_id text NOT NULL REFERENCES webhook_delivery(id) ON DELETE CASCADE,
 attempt_number integer NOT NULL CHECK (attempt_number > 0),
 replay_count integer NOT NULL CHECK (replay_count BETWEEN 0 AND 100),
 status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'succeeded', 'failed', 'abandoned')),
 signing_secret_version integer NOT NULL CHECK (signing_secret_version > 0),
 signature_timestamp bigint NOT NULL CHECK (signature_timestamp > 0),
 http_status integer CHECK (http_status BETWEEN 100 AND 599),
 error_code text,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 UNIQUE (delivery_id, attempt_number)
);

CREATE FUNCTION publish_webhook_event(source_key_value text, room_id_value text, event_type_value text, occurred_at_value timestamptz, data_value jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE owning_project text; owning_environment text; event_id_value text; payload_value jsonb;
BEGIN
 IF occurred_at_value IS NULL THEN RETURN; END IF;
 SELECT project_id, environment_id INTO owning_project, owning_environment FROM usage_history_room WHERE id = room_id_value;
 IF owning_project IS NULL THEN RETURN; END IF;
 event_id_value := 'event_' || md5(jsonb_build_array(owning_project, owning_environment, source_key_value)::text);
 payload_value := jsonb_build_object('id', event_id_value, 'type', event_type_value, 'projectId', owning_project, 'environmentId', owning_environment,
   'occurredAt', to_char(occurred_at_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'data', data_value);
 INSERT INTO webhook_event (id, source_key, project_id, environment_id, event_type, occurred_at, payload, body)
 VALUES (event_id_value, source_key_value, owning_project, owning_environment, event_type_value, occurred_at_value, payload_value, payload_value::text)
 ON CONFLICT (project_id, environment_id, source_key) DO NOTHING;
END $$;

CREATE FUNCTION enqueue_webhook_deliveries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO webhook_delivery (event_id, endpoint_id, project_id, environment_id, url)
 SELECT NEW.id, e.id, NEW.project_id, NEW.environment_id, e.url FROM webhook_endpoint e
 JOIN environment v ON v.id = e.environment_id AND v.project_id = e.project_id
 JOIN project p ON p.id = e.project_id JOIN organization o ON o.id = p.organization_id
 WHERE e.project_id = NEW.project_id AND e.environment_id = NEW.environment_id AND e.status = 'enabled'
   AND e.deleted_at IS NULL AND NEW.event_type = ANY(e.event_types)
   AND v.status = 'active' AND p.status = 'active' AND o.status = 'active';
 RETURN NEW;
END $$;
CREATE TRIGGER webhook_event_fanout AFTER INSERT ON webhook_event FOR EACH ROW EXECUTE FUNCTION enqueue_webhook_deliveries();

CREATE FUNCTION retain_lifecycle_webhook() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; source text;
BEGIN
 IF NEW.boundary = 'legacy' THEN RETURN NEW; END IF;
 kind := NEW.event_type; source := NEW.id;
 IF kind = 'connection.opened' THEN
  IF EXISTS (SELECT 1 FROM usage_lifecycle_event WHERE session_id = NEW.session_id AND event_type = 'connection.opened' AND id <> NEW.id) THEN
   kind := 'participant.reconnected';
  ELSE
   kind := 'participant.joined'; source := 'participant.joined:' || NEW.participant_id;
  END IF;
 ELSIF kind NOT IN ('room.created', 'room.started', 'room.ended', 'participant.left') THEN RETURN NEW;
 END IF;
 PERFORM publish_webhook_event('lifecycle:' || source, NEW.room_id, kind, NEW.occurred_at,
   jsonb_strip_nulls(jsonb_build_object('roomId', NEW.room_id, 'sessionId', NEW.session_id, 'participantId', NEW.participant_id, 'boundary', NEW.boundary)));
 RETURN NEW;
END $$;
CREATE TRIGGER lifecycle_webhook_outbox AFTER INSERT ON usage_lifecycle_event FOR EACH ROW EXECUTE FUNCTION retain_lifecycle_webhook();

CREATE FUNCTION retain_track_webhook() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_value jsonb; previous_sequence numeric := 0;
BEGIN
 IF TG_OP = 'UPDATE' THEN previous_sequence := coalesce((OLD.state->>'Sequence')::numeric, 0); END IF;
 FOR event_value IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.state->'Events') = 'array' THEN NEW.state->'Events' ELSE '[]'::jsonb END) LOOP
  IF event_value->>'Type' IN ('track.published', 'track.unpublished') AND (event_value->>'Sequence')::numeric > previous_sequence THEN
   PERFORM publish_webhook_event('rtc:' || NEW.room_id || ':' || (event_value->>'ID'), NEW.room_id, event_value->>'Type',
     (event_value->>'SentAt')::timestamptz, coalesce(event_value->'Payload', '{}'::jsonb) || jsonb_build_object('roomId', NEW.room_id));
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER track_webhook_outbox AFTER INSERT OR UPDATE OF state ON rtc_runtime FOR EACH ROW EXECUTE FUNCTION retain_track_webhook();

CREATE FUNCTION retain_quality_webhook() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_quality text; kind text;
BEGIN
 IF TG_OP = 'UPDATE' THEN previous_quality := OLD.latest_quality;
 ELSE
  SELECT latest_quality INTO previous_quality FROM rtc_quality_metric WHERE room_id = NEW.room_id AND participant_id = NEW.participant_id
    AND bucket_started_at < NEW.bucket_started_at ORDER BY bucket_started_at DESC LIMIT 1;
 END IF;
 IF previous_quality IS NULL OR previous_quality = NEW.latest_quality THEN RETURN NEW; END IF;
 IF previous_quality IN ('excellent', 'good') AND NEW.latest_quality IN ('poor', 'critical', 'lost') THEN kind := 'connection.degraded';
 ELSIF previous_quality IN ('poor', 'critical', 'lost') AND NEW.latest_quality IN ('excellent', 'good') THEN kind := 'connection.recovered';
 ELSE RETURN NEW;
 END IF;
 PERFORM publish_webhook_event('quality:' || NEW.room_id || ':' || NEW.participant_id || ':' || extract(epoch from NEW.bucket_started_at)::text || ':' || NEW.sample_count::text,
   NEW.room_id, kind, NEW.updated_at, jsonb_build_object('roomId', NEW.room_id, 'participantId', NEW.participant_id, 'previousQuality', previous_quality, 'quality', NEW.latest_quality));
 RETURN NEW;
END $$;
CREATE TRIGGER quality_webhook_outbox AFTER INSERT OR UPDATE OF latest_quality ON rtc_quality_metric FOR EACH ROW EXECUTE FUNCTION retain_quality_webhook();
