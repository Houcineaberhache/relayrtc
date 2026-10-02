ALTER TABLE "environment" ADD COLUMN "deletion_protected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "environment" SET "deletion_protected" = true WHERE "type" in ('development', 'production');--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_defaults_protected_check" CHECK ("environment"."type" not in ('development', 'production') or "environment"."deletion_protected" = true);
