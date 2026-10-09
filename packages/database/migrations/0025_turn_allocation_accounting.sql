ALTER TABLE usage_event ADD COLUMN source text NOT NULL DEFAULT 'legacy';

CREATE TABLE turn_credential (
 username text PRIMARY KEY,
 organization_id text NOT NULL,
 project_id text NOT NULL,
 environment_id text NOT NULL,
 room_id text,
 session_id text,
 participant_id text,
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK (expires_at > issued_at),
 CHECK ((room_id IS NULL) = (session_id IS NULL))
);
CREATE INDEX turn_credential_retention_idx ON turn_credential (expires_at);

CREATE TABLE turn_log_checkpoint (
 id text PRIMARY KEY,
 byte_offset bigint NOT NULL DEFAULT 0 CHECK (byte_offset >= 0),
 last_observed_at timestamptz,
 started_at timestamptz,
 collected_through_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 rejected_observations bigint NOT NULL DEFAULT 0,
 reconciliation jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE turn_allocation (
 id text PRIMARY KEY,
 source_id text NOT NULL REFERENCES turn_log_checkpoint(id),
 native_id text NOT NULL,
 username text NOT NULL REFERENCES turn_credential(username),
 organization_id text NOT NULL,
 project_id text NOT NULL,
 environment_id text NOT NULL,
 room_id text,
 session_id text,
 started_at timestamptz NOT NULL,
 last_observed_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 ended_at timestamptz,
 coverage text NOT NULL DEFAULT 'partial' CHECK (coverage IN ('partial', 'complete')),
 client_ingress_bytes bigint NOT NULL DEFAULT 0 CHECK (client_ingress_bytes >= 0),
 client_egress_bytes bigint NOT NULL DEFAULT 0 CHECK (client_egress_bytes >= 0),
 peer_ingress_bytes bigint NOT NULL DEFAULT 0 CHECK (peer_ingress_bytes >= 0),
 peer_egress_bytes bigint NOT NULL DEFAULT 0 CHECK (peer_egress_bytes >= 0),
 CHECK (last_observed_at >= started_at),
 CHECK (ended_at IS NULL OR ended_at >= started_at),
 UNIQUE (source_id, native_id)
);
CREATE INDEX turn_allocation_scope_time_idx ON turn_allocation (organization_id, project_id, environment_id, started_at);
CREATE INDEX turn_allocation_retention_idx ON turn_allocation (ended_at);

CREATE TABLE turn_observation (
 id text PRIMARY KEY,
 source_id text NOT NULL REFERENCES turn_log_checkpoint(id),
 native_id text NOT NULL,
 allocation_id text REFERENCES turn_allocation(id),
 occurred_at timestamptz NOT NULL,
 kind text NOT NULL CHECK (kind IN ('new', 'refreshed', 'deleted', 'client', 'peer')),
 ingress_bytes bigint NOT NULL DEFAULT 0 CHECK (ingress_bytes >= 0),
 egress_bytes bigint NOT NULL DEFAULT 0 CHECK (egress_bytes >= 0)
);
CREATE INDEX turn_observation_source_time_idx ON turn_observation (source_id, occurred_at);
CREATE INDEX turn_observation_allocation_idx ON turn_observation (allocation_id, kind, occurred_at);

CREATE FUNCTION invalidate_turn_allocation_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM queue_usage_aggregation(NEW.organization_id, NEW.started_at, NEW.last_observed_at);
 RETURN NEW;
END $$;
CREATE TRIGGER turn_allocation_aggregation_dirty AFTER INSERT OR UPDATE ON turn_allocation FOR EACH ROW EXECUTE FUNCTION invalidate_turn_allocation_usage();
DO $$
DECLARE source record;
BEGIN
 FOR source IN SELECT DISTINCT organization_id, occurred_at FROM usage_event WHERE metric IN ('turnIngressBytes', 'turnEgressBytes') LOOP
  PERFORM queue_usage_aggregation(source.organization_id, source.occurred_at, source.occurred_at);
 END LOOP;
END $$;
