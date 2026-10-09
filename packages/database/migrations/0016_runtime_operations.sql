ALTER TABLE organization ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleting'));
ALTER TABLE environment ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleting'));

CREATE TABLE runtime_operation (
 id text PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('room.end', 'project.delete', 'organization.delete', 'environment.delete')),
 resource_id text NOT NULL,
 organization_id text,
 project_id text,
 environment_id text,
 payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'failed', 'completed')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_token text,
 lease_expires_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX runtime_operation_due_idx ON runtime_operation (status, available_at);
CREATE INDEX runtime_operation_project_idx ON runtime_operation (project_id);
CREATE INDEX runtime_operation_organization_idx ON runtime_operation (organization_id);

CREATE FUNCTION queue_room_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target room; organization_key text;
BEGIN
 IF TG_OP = 'DELETE' THEN target := OLD; ELSE target := NEW; END IF;
 IF TG_OP <> 'DELETE' AND target.status <> 'ended' THEN RETURN NEW; END IF;
 SELECT organization_id INTO organization_key FROM project WHERE id = target.project_id;
 INSERT INTO runtime_operation (id, kind, resource_id, organization_id, project_id, environment_id, payload)
 VALUES ('room.end:' || target.id, 'room.end', target.id, organization_key, target.project_id, target.environment_id,
 jsonb_build_object('id', target.id, 'status', 'ended', 'endedAt', coalesce(target.ended_at, now())))
 ON CONFLICT (id) DO NOTHING;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER room_cleanup_outbox AFTER INSERT OR UPDATE OF status ON room FOR EACH ROW EXECUTE FUNCTION queue_room_cleanup();
CREATE TRIGGER room_deleted_cleanup_outbox BEFORE DELETE ON room FOR EACH ROW EXECUTE FUNCTION queue_room_cleanup();

CREATE FUNCTION queue_parent_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status <> 'deleting' THEN
  IF OLD.status = 'deleting' THEN RAISE EXCEPTION 'Deletion cannot be cancelled' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME = 'organization' THEN
  INSERT INTO runtime_operation (id, kind, resource_id, organization_id)
  VALUES ('organization.delete:' || NEW.id, 'organization.delete', NEW.id, NEW.id) ON CONFLICT (id) DO NOTHING;
  UPDATE project SET status = 'deleting', updated_at = now() WHERE organization_id = NEW.id;
  UPDATE room SET status = 'ended', ended_at = coalesce(ended_at, now())
  WHERE project_id IN (SELECT id FROM project WHERE organization_id = NEW.id);
 ELSIF TG_TABLE_NAME = 'project' THEN
  INSERT INTO runtime_operation (id, kind, resource_id, organization_id, project_id)
  VALUES ('project.delete:' || NEW.id, 'project.delete', NEW.id, NEW.organization_id, NEW.id) ON CONFLICT (id) DO NOTHING;
  UPDATE room SET status = 'ended', ended_at = coalesce(ended_at, now()) WHERE project_id = NEW.id;
 ELSE
  INSERT INTO runtime_operation (id, kind, resource_id, organization_id, project_id, environment_id)
  SELECT 'environment.delete:' || NEW.id, 'environment.delete', NEW.id, organization_id, NEW.project_id, NEW.id
  FROM project WHERE id = NEW.project_id ON CONFLICT (id) DO NOTHING;
  UPDATE room SET status = 'ended', ended_at = coalesce(ended_at, now()) WHERE environment_id = NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER organization_cleanup_outbox AFTER UPDATE OF status ON organization FOR EACH ROW EXECUTE FUNCTION queue_parent_cleanup();
CREATE TRIGGER project_cleanup_outbox AFTER UPDATE OF status ON project FOR EACH ROW EXECUTE FUNCTION queue_parent_cleanup();
CREATE TRIGGER environment_cleanup_outbox AFTER UPDATE OF status ON environment FOR EACH ROW EXECUTE FUNCTION queue_parent_cleanup();

CREATE FUNCTION require_live_resource_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE organization_key text; parent_status text; environment_key text;
BEGIN
 IF TG_TABLE_NAME IN ('project', 'member', 'invitation') THEN organization_key := NEW.organization_id;
 ELSE SELECT organization_id INTO organization_key FROM project WHERE id = NEW.project_id;
 END IF;
 SELECT status INTO parent_status FROM organization WHERE id = organization_key FOR SHARE;
 IF parent_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Organization is unavailable' USING ERRCODE = '23514'; END IF;
 IF TG_TABLE_NAME NOT IN ('project', 'member', 'invitation') THEN
  SELECT status INTO parent_status FROM project WHERE id = NEW.project_id FOR SHARE;
  IF parent_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Project is unavailable' USING ERRCODE = '23514'; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('room', 'api_key') THEN
  environment_key := NEW.environment_id;
  SELECT status INTO parent_status FROM environment WHERE id = environment_key AND project_id = NEW.project_id FOR SHARE;
  IF parent_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Environment is unavailable' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_parent_guard BEFORE INSERT OR UPDATE OF organization_id ON project FOR EACH ROW EXECUTE FUNCTION require_live_resource_parent();
CREATE TRIGGER member_parent_guard BEFORE INSERT OR UPDATE OF organization_id ON member FOR EACH ROW EXECUTE FUNCTION require_live_resource_parent();
CREATE TRIGGER invitation_parent_guard BEFORE INSERT OR UPDATE OF organization_id ON invitation FOR EACH ROW EXECUTE FUNCTION require_live_resource_parent();
CREATE TRIGGER environment_parent_guard BEFORE INSERT OR UPDATE OF project_id ON environment FOR EACH ROW EXECUTE FUNCTION require_live_resource_parent();
CREATE TRIGGER room_parent_guard BEFORE INSERT OR UPDATE OF project_id, environment_id ON room FOR EACH ROW EXECUTE FUNCTION require_live_resource_parent();
CREATE TRIGGER api_key_parent_guard BEFORE INSERT OR UPDATE OF project_id, environment_id ON api_key FOR EACH ROW EXECUTE FUNCTION require_live_resource_parent();

UPDATE project SET status = 'deleting' WHERE status = 'deleting';
UPDATE room SET status = 'ended', ended_at = coalesce(ended_at, now()) WHERE status = 'ended';
