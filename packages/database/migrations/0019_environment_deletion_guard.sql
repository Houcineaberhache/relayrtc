CREATE FUNCTION guard_environment_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status = 'deleting' AND OLD.status <> 'deleting'
    AND (OLD.deletion_protected OR OLD.type IN ('development', 'production')) THEN
  RAISE EXCEPTION 'Environment is protected' USING ERRCODE = '23514';
 END IF;
 IF OLD.status = 'deleting' AND (NEW.name, NEW.slug, NEW.type, NEW.deletion_protected, NEW.project_id)
    IS DISTINCT FROM (OLD.name, OLD.slug, OLD.type, OLD.deletion_protected, OLD.project_id) THEN
  RAISE EXCEPTION 'Environment is being deleted' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER environment_deletion_guard BEFORE UPDATE ON environment
 FOR EACH ROW EXECUTE FUNCTION guard_environment_deletion();
