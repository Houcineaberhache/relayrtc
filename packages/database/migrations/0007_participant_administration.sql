CREATE TABLE "participant" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"role" text DEFAULT 'participant' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "participant_left_at_check" CHECK ("participant"."left_at" is null or "participant"."left_at" >= "participant"."joined_at")
);
--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_room_joined_at_idx" ON "participant" USING btree ("room_id","joined_at");--> statement-breakpoint
CREATE INDEX "participant_room_left_at_idx" ON "participant" USING btree ("room_id","left_at");