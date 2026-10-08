ALTER TABLE "participant_session" ADD COLUMN "client_ip" text;
--> statement-breakpoint
ALTER TABLE "participant_session" ADD COLUMN "country_code" text;
--> statement-breakpoint
ALTER TABLE "participant_session" ADD COLUMN "country" text;
--> statement-breakpoint
CREATE INDEX "participant_session_country_idx" ON "participant_session" USING btree ("country");
