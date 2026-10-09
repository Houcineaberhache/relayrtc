CREATE OR REPLACE FUNCTION queue_room_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target room; organization_key text; operation_key text;
BEGIN
 IF TG_OP = 'DELETE' THEN target := OLD; ELSE target := NEW; END IF;
 IF TG_OP <> 'DELETE' AND target.status NOT IN ('ended', 'failed') THEN RETURN NEW; END IF;
 operation_key := 'room.end:' || target.id;
 SELECT organization_id INTO organization_key FROM project WHERE id = target.project_id;
 INSERT INTO runtime_operation (id, kind, resource_id, organization_id, project_id, environment_id, payload)
 VALUES (operation_key, 'room.end', target.id, organization_key, target.project_id, target.environment_id,
 jsonb_build_object('id', target.id, 'status', 'ended', 'endedAt', coalesce(target.ended_at, now())))
 ON CONFLICT (id) DO NOTHING;
 INSERT INTO participant_removal_target (operation_id, session_id, participant_id, room_id, signaling_node_id)
 SELECT operation_key, s.id, p.id, target.id, s.signaling_node_id
 FROM participant_session s JOIN participant p ON p.id = s.participant_id
 WHERE p.room_id = target.id AND (s.connection_state IN ('connecting', 'connected', 'reconnecting')
 OR EXISTS (SELECT 1 FROM rtc_runtime m WHERE m.room_id = target.id AND m.state->'Sessions' ? s.id))
 ON CONFLICT (operation_id, session_id) DO UPDATE SET status = 'pending', available_at = now(), completed_at = NULL
 WHERE participant_removal_target.status = 'completed'
 AND EXISTS (SELECT 1 FROM runtime_operation WHERE id = operation_key AND status = 'completed');
 UPDATE runtime_operation SET status = 'pending', available_at = now(), completed_at = NULL, last_error = NULL
 WHERE id = operation_key AND status = 'completed' AND (
 EXISTS (SELECT 1 FROM participant_removal_target WHERE operation_id = operation_key AND status <> 'completed')
 OR EXISTS (SELECT 1 FROM rtc_runtime m WHERE m.room_id = target.id AND (
 coalesce(m.state->>'Generation', '') <> '' OR coalesce((m.state->>'Allocating')::boolean, false)
 OR coalesce(m.state->'Sessions', '{}'::jsonb) <> '{}'::jsonb)));
 UPDATE participant_session s SET connection_state = 'disconnected',
 connection_seconds = s.connection_seconds + CASE WHEN s.connection_state = 'connected'
 THEN greatest(0, extract(epoch from (coalesce(target.ended_at, now()) - coalesce(s.reconnected_at, s.joined_at)))) ELSE 0 END,
 disconnected_at = CASE WHEN s.connection_state = 'connected' THEN greatest(s.joined_at, coalesce(target.ended_at, now()))
 ELSE coalesce(s.disconnected_at, greatest(s.joined_at, coalesce(target.ended_at, now()))) END
 FROM participant p WHERE s.participant_id = p.id AND p.room_id = target.id AND s.connection_state <> 'disconnected';
 UPDATE participant SET left_at = coalesce(left_at, greatest(joined_at, coalesce(target.ended_at, now()))) WHERE room_id = target.id;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

UPDATE room SET status = status, ended_at = coalesce(ended_at, now()) WHERE status IN ('ended', 'failed');
