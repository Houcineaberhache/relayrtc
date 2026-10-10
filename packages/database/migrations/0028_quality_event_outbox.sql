CREATE TABLE rtc_quality_event_outbox (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  participant_id text NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz,
  expired_at timestamptz,
  last_error text,
  CONSTRAINT rtc_quality_event_type_check CHECK (event_type IN ('connection.quality.changed', 'connection.degraded', 'connection.recovered'))
);
CREATE INDEX rtc_quality_event_pending_idx ON rtc_quality_event_outbox(next_attempt_at) WHERE delivered_at IS NULL AND expired_at IS NULL;
CREATE INDEX rtc_quality_event_stream_idx ON rtc_quality_event_outbox(room_id, session_id, occurred_at, id);
CREATE TABLE rtc_quality_sample_receipt (id text PRIMARY KEY, recorded_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX rtc_quality_sample_receipt_recorded_idx ON rtc_quality_sample_receipt(recorded_at);
