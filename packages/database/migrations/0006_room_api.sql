CREATE TABLE "room" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"max_participants" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "room_status_check" CHECK ("room"."status" in ('created', 'active', 'ending', 'ended', 'failed')),
	CONSTRAINT "room_max_participants_check" CHECK ("room"."max_participants" > 0),
	CONSTRAINT "room_ended_at_check" CHECK (("room"."status" = 'ended' and "room"."ended_at" is not null) or ("room"."status" <> 'ended'))
);
--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_environment_project_fk" FOREIGN KEY ("environment_id","project_id") REFERENCES "public"."environment"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_project_environment_created_at_idx" ON "room" USING btree ("project_id","environment_id","created_at");--> statement-breakpoint
CREATE INDEX "room_project_environment_status_idx" ON "room" USING btree ("project_id","environment_id","status");