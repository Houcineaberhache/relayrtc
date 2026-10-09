CREATE TABLE signaling_usage_sample (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES participant_session(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signaling_usage_sample_session_idx ON signaling_usage_sample(session_id);
