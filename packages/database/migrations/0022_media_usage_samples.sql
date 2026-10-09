CREATE TABLE media_usage_sample (
 id text PRIMARY KEY,
 room_id text NOT NULL,
 organization_id text NOT NULL,
 project_id text NOT NULL,
 environment_id text NOT NULL,
 metrics jsonb NOT NULL,
 occurred_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT media_usage_sample_metrics_check CHECK (jsonb_typeof(metrics) = 'object')
);
CREATE INDEX media_usage_sample_retention_idx ON media_usage_sample (occurred_at);
