CREATE TABLE "participant_session" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"signaling_node_id" text NOT NULL,
	"media_node_id" text,
	"connection_state" text DEFAULT 'connected' NOT NULL,
	"transport_type" text DEFAULT 'tcp' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"reconnected_at" timestamp with time zone,
	CONSTRAINT "participant_session_connection_state_check" CHECK ("participant_session"."connection_state" in ('connecting', 'connected', 'reconnecting', 'disconnected', 'failed')),
	CONSTRAINT "participant_session_transport_type_check" CHECK ("participant_session"."transport_type" in ('udp', 'tcp', 'tls'))
);
--> statement-breakpoint
ALTER TABLE "participant_session" ADD CONSTRAINT "participant_session_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_session_participant_id_idx" ON "participant_session" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "participant_session_node_state_idx" ON "participant_session" USING btree ("signaling_node_id","connection_state");