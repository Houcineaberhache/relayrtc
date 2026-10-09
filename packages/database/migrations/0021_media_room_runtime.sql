CREATE TABLE media_room_runtime (
 room_id text PRIMARY KEY REFERENCES room(id) ON DELETE CASCADE,
 node_id text NOT NULL,
 worker_id text NOT NULL,
 allocated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_room_runtime_node_idx ON media_room_runtime (node_id);
