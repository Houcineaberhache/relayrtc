ALTER TABLE "participant_session" ADD COLUMN "messages_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_session" ADD COLUMN "messages_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_session" ADD COLUMN "connection_seconds" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"room_id" text,
	"region" text,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_event_value_check" CHECK ("usage_event"."value" >= 0)
);--> statement-breakpoint
CREATE TABLE "usage_aggregate" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"environment_id" text,
	"granularity" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_ended_at" timestamp with time zone NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_aggregate_granularity_check" CHECK ("usage_aggregate"."granularity" in ('hour', 'day', 'month'))
);--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_aggregate" ADD CONSTRAINT "usage_aggregate_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_aggregate" ADD CONSTRAINT "usage_aggregate_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_aggregate" ADD CONSTRAINT "usage_aggregate_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_event_scope_time_idx" ON "usage_event" USING btree ("organization_id","project_id","environment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_event_room_time_idx" ON "usage_event" USING btree ("room_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_aggregate_scope_window_idx" ON "usage_aggregate" USING btree ("organization_id","project_id","environment_id","granularity","window_started_at");--> statement-breakpoint
CREATE INDEX "usage_aggregate_organization_window_idx" ON "usage_aggregate" USING btree ("organization_id","granularity","window_started_at");
