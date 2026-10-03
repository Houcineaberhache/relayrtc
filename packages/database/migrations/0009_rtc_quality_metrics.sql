CREATE TABLE "rtc_quality_metric" (
	"room_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"bucket_started_at" timestamp with time zone NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"bitrate_sample_count" integer DEFAULT 0 NOT NULL,
	"incoming_bitrate_sum" double precision DEFAULT 0 NOT NULL,
	"jitter_sample_count" integer DEFAULT 0 NOT NULL,
	"jitter_sum" double precision DEFAULT 0 NOT NULL,
	"round_trip_time_sample_count" integer DEFAULT 0 NOT NULL,
	"round_trip_time_sum" double precision DEFAULT 0 NOT NULL,
	"packets_lost" integer DEFAULT 0 NOT NULL,
	"packets_received" integer DEFAULT 0 NOT NULL,
	"latest_quality" text NOT NULL,
	"worst_quality" text NOT NULL,
	"worst_quality_severity" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rtc_quality_metric_room_id_participant_id_bucket_started_at_pk" PRIMARY KEY("room_id","participant_id","bucket_started_at"),
	CONSTRAINT "rtc_quality_metric_sample_count_check" CHECK ("rtc_quality_metric"."sample_count" > 0),
	CONSTRAINT "rtc_quality_metric_quality_check" CHECK ("rtc_quality_metric"."latest_quality" in ('excellent', 'good', 'poor', 'critical', 'lost') and "rtc_quality_metric"."worst_quality" in ('excellent', 'good', 'poor', 'critical', 'lost'))
);
--> statement-breakpoint
ALTER TABLE "rtc_quality_metric" ADD CONSTRAINT "rtc_quality_metric_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtc_quality_metric" ADD CONSTRAINT "rtc_quality_metric_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rtc_quality_metric_participant_bucket_idx" ON "rtc_quality_metric" USING btree ("participant_id","bucket_started_at");--> statement-breakpoint
CREATE INDEX "rtc_quality_metric_room_bucket_idx" ON "rtc_quality_metric" USING btree ("room_id","bucket_started_at");