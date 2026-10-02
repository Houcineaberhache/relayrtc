CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"prefix" text NOT NULL,
	"hashed_secret" text NOT NULL,
	"scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text NOT NULL,
	CONSTRAINT "api_key_type_check" CHECK ("api_key"."type" in ('publishable', 'secret')),
	CONSTRAINT "api_key_publishable_scopes_check" CHECK ("api_key"."type" = 'secret' or cardinality("api_key"."scopes") = 0),
	CONSTRAINT "api_key_expiration_check" CHECK ("api_key"."expires_at" is null or "api_key"."expires_at" > "api_key"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "environment_id_project_id_idx" ON "environment" USING btree ("id","project_id");--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_environment_project_fk" FOREIGN KEY ("environment_id","project_id") REFERENCES "public"."environment"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_project_id_idx" ON "api_key" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "api_key_environment_id_idx" ON "api_key" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "api_key_active_idx" ON "api_key" USING btree ("environment_id","revoked_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_prefix_idx" ON "api_key" USING btree ("prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hashed_secret_idx" ON "api_key" USING btree ("hashed_secret");
