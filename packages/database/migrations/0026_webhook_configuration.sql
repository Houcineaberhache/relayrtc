CREATE TABLE webhook_endpoint (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 environment_id text NOT NULL,
 url text NOT NULL CHECK (length(url) <= 2048),
 event_types text[] NOT NULL,
 status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
 encrypted_signing_secret text NOT NULL,
 signing_secret_version integer NOT NULL DEFAULT 1 CHECK (signing_secret_version > 0),
 signing_secret_rotated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 FOREIGN KEY (environment_id, project_id) REFERENCES environment(id, project_id) ON DELETE CASCADE,
 CHECK (cardinality(event_types) BETWEEN 1 AND 10),
 CHECK (event_types <@ ARRAY['room.created', 'room.started', 'room.ended', 'participant.joined', 'participant.left', 'participant.reconnected', 'track.published', 'track.unpublished', 'connection.degraded', 'connection.recovered']::text[]),
 CHECK (array_position(event_types, NULL) IS NULL),
 CHECK (deleted_at IS NULL OR status = 'disabled')
);
CREATE INDEX webhook_endpoint_scope_idx ON webhook_endpoint (project_id, environment_id, created_at, id) WHERE deleted_at IS NULL;
