CREATE FUNCTION "enforce_organization_owner"() RETURNS trigger AS $$
DECLARE
	"affected_organization_id" text;
	"owner_count" integer;
BEGIN
	IF TG_OP = 'DELETE' THEN
		"affected_organization_id" := OLD."organization_id";
	ELSE
		"affected_organization_id" := NEW."organization_id";
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "organization"
		WHERE "id" = "affected_organization_id"
	) THEN
		SELECT count(*)
		INTO "owner_count"
		FROM "member"
		WHERE "organization_id" = "affected_organization_id"
			AND "role" ~ '(^|,[[:space:]]*)owner([[:space:]]*,|$)';

		IF "owner_count" <> 1 THEN
			RAISE EXCEPTION 'OWNER_ROLE_PROTECTED'
				USING ERRCODE = '23514';
		END IF;
	END IF;

	RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "organization_owner_required"
AFTER INSERT OR UPDATE OR DELETE ON "member"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_organization_owner"();
