CREATE TABLE "rtc_runtime" (
  "room_id" text PRIMARY KEY REFERENCES "room" ("id") ON DELETE CASCADE,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "rtc_runtime_state_check" CHECK (jsonb_typeof("state") = 'object' AND octet_length("state"::text) <= 8388608)
);
