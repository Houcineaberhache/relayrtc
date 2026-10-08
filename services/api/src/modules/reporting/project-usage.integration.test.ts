import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createDatabase } from "@relayrtc/database";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import Fastify from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getProjectUsage } from "./project-usage.service.js";
import { reportingRoutes } from "./reporting.routes.js";
import { registerErrorHandling } from "../../http/errors/error-handler.js";

const databaseUrl = process.env.RELAYRTC_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== "/relayrtc_usage_test") {
  throw new Error("Usage integration tests require a dedicated relayrtc_usage_test database");
}
const scope = { organizationId: "org_1", projectId: "project_1", environmentId: null };
const now = new Date("2026-10-08T12:00:00.000Z");

describe.skipIf(!databaseUrl)("project usage against PostgreSQL", () => {
  const database = createDatabase(databaseUrl ?? "postgresql://localhost/relayrtc_usage_test", {
    maxConnections: 1,
  });
  const query = (statement: string, values: string[] = []) =>
    database.client.unsafe(statement, values);

  beforeAll(async () => {
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(
        new URL("../../../../../packages/database/migrations", import.meta.url),
      ),
    });
  }, 30_000);
  beforeEach(async () => {
    await query("BEGIN");
    await query(
      `INSERT INTO organization (id, name, slug) VALUES ('org_1', 'Test', 'test'), ('org_2', 'Other', 'other')`,
    );
    await query(`INSERT INTO project (id, organization_id, name, slug) VALUES
      ('project_1', 'org_1', 'Test', 'test'), ('project_2', 'org_2', 'Other', 'other')`);
    await query(`INSERT INTO environment (id, project_id, name, slug, type) VALUES
      ('env_1', 'project_1', 'One', 'one', 'custom'), ('env_2', 'project_1', 'Two', 'two', 'custom'),
      ('env_other', 'project_2', 'Other', 'other', 'custom')`);
  });
  afterEach(async () => {
    await query("ROLLBACK");
  });
  afterAll(async () => {
    await database.close();
  });

  const room = async (id = "room_1", environment = "env_1", project = "project_1") => {
    await query(
      `INSERT INTO room (id, project_id, environment_id, name, max_participants, status, created_at, started_at)
      VALUES ($1, $2, $3, $1, 100, 'active', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`,
      [id, project, environment],
    );
  };
  const session = async (id: string, participantId: string, joined: string, roomId = "room_1") => {
    await query(
      `INSERT INTO participant (id, room_id, name, joined_at) VALUES ($1, $2, $1, $3)
      ON CONFLICT (id) DO NOTHING`,
      [participantId, roomId, joined],
    );
    await query(
      `INSERT INTO participant_session (id, participant_id, signaling_node_id, joined_at, metering_started_at)
      VALUES ($1, $2, 'node_1', $3, $3)`,
      [id, participantId, joined],
    );
  };
  const disconnect = async (id: string, at: string) => {
    await query(
      `UPDATE participant_session SET connection_state = 'reconnecting', disconnected_at = $2 WHERE id = $1`,
      [id, at],
    );
  };
  const resume = async (id: string, at: string) => {
    await query(
      `UPDATE participant_session SET connection_state = 'connected', disconnected_at = NULL, reconnected_at = $2 WHERE id = $1`,
      [id, at],
    );
  };

  it.each(["24h", "7d", "14d", "30d"] as const)(
    "returns zero usage and continuous empty buckets for %s",
    async (range) => {
      const result = await getProjectUsage(database.db, scope, range, now);
      expect(Object.values(result.summary).every((value) => value === 0)).toBe(true);
      expect(
        result.buckets.every(
          (bucket) => bucket.participantSeconds === 0 && bucket.roomsCreated === 0,
        ),
      ).toBe(true);
      expect(result.buckets[0]?.startedAt).toBe(result.window.startedAt);
      expect(result.buckets.at(-1)?.endedAt).toBe(result.window.endedAt);
      expect(result.dataQuality).toEqual({
        sessionHistory: "complete",
        messageHistory: "complete",
      });
    },
  );
  it("clips older connections and future timestamps to the selected period", async () => {
    await room();
    await session("s1", "p1", "2026-10-01T11:59:00Z");
    await disconnect("s1", "2026-10-01T12:02:00Z");
    await session("s2", "p2", "2026-10-08T11:59:30Z");
    await disconnect("s2", "2026-10-09T00:00:00Z");
    const result = await getProjectUsage(database.db, scope, "7d", now);
    expect(result.summary.participantSeconds).toBe(150);
    expect(result.summary.signalingConnectionSeconds).toBe(150);
    expect(result.summary.signalingConnections).toBe(1);
    expect(result.summary.roomsCreated).toBe(0);
    expect(result.summary.peakConcurrentParticipants).toBe(1);
    expect(result.buckets.reduce((total, bucket) => total + bucket.participantSeconds, 0)).toBe(
      150,
    );
  });
  it("excludes reconnect gaps and does not accrue time while reconnecting", async () => {
    await room();
    await session("s1", "p1", "2026-10-02T10:00:00Z");
    await disconnect("s1", "2026-10-02T10:10:00Z");
    await resume("s1", "2026-10-02T10:20:00Z");
    await disconnect("s1", "2026-10-02T10:30:00Z");
    const result = await getProjectUsage(database.db, scope, "7d", now);
    expect(result.summary.participantSeconds).toBe(1200);
    expect(result.summary.signalingConnectionSeconds).toBe(1200);
    expect(result.summary.peakConcurrentParticipants).toBe(1);
    expect(
      (await query("SELECT * FROM participant_connection_interval WHERE session_id = 's1'")).length,
    ).toBe(2);
  });
  it("counts a participant once across overlapping sessions while preserving signaling time", async () => {
    await room();
    await session("s1", "p1", "2026-10-02T10:00:00Z");
    await session("s2", "p1", "2026-10-02T10:05:00Z");
    await disconnect("s1", "2026-10-02T10:10:00Z");
    await disconnect("s2", "2026-10-02T10:15:00Z");
    const result = await getProjectUsage(database.db, scope, "7d", now);
    expect(result.summary.participantSeconds).toBe(900);
    expect(result.summary.signalingConnectionSeconds).toBe(1200);
    expect(result.summary.peakConcurrentParticipants).toBe(1);
  });
  it("caps active connections at participant leave and room termination", async () => {
    await room();
    await session("s1", "p1", "2026-10-08T11:50:00Z");
    await session("s2", "p2", "2026-10-08T11:55:00Z");
    await query("UPDATE participant SET left_at = '2026-10-08T11:52:00Z' WHERE id = 'p1'");
    await query(
      "UPDATE room SET ended_at = '2026-10-08T11:58:00Z', status = 'ended' WHERE id = 'room_1'",
    );
    const result = await getProjectUsage(database.db, scope, "7d", now);
    expect(result.summary.participantSeconds).toBe(300);
    expect(result.summary.peakConcurrentParticipants).toBe(1);
  });
  it("caps ongoing connections at the report timestamp", async () => {
    await room();
    await session("s1", "p1", "2026-10-08T11:59:00.500Z");
    const result = await getProjectUsage(database.db, scope, "24h", now);
    expect(result.summary.participantSeconds).toBe(59.5);
    expect(result.buckets.reduce((total, bucket) => total + bucket.participantSeconds, 0)).toBe(
      59.5,
    );
  });
  it("does not create concurrency for zero-length connections or double-count simultaneous transitions", async () => {
    await room();
    await session("s0", "p0", "2026-10-02T10:00:00Z");
    await disconnect("s0", "2026-10-02T10:00:00Z");
    await session("s1", "p1", "2026-10-02T10:00:00Z");
    await disconnect("s1", "2026-10-02T10:10:00Z");
    await session("s2", "p2", "2026-10-02T10:10:00Z");
    await disconnect("s2", "2026-10-02T10:20:00Z");
    const result = await getProjectUsage(database.db, scope, "7d", now);
    expect(result.summary.participantSeconds).toBe(1200);
    expect(result.summary.peakConcurrentParticipants).toBe(1);
  });
  it("counts room creation in its period and ignores rooms that never became active", async () => {
    await query(`INSERT INTO room (id, project_id, environment_id, name, max_participants, created_at)
      VALUES ('r1', 'project_1', 'env_1', 'One', 10, '2026-10-01T12:00:00Z'),
      ('r2', 'project_1', 'env_1', 'Two', 10, '2026-10-08T12:00:00Z')`);
    const result = await getProjectUsage(database.db, scope, "7d", now);
    expect(result.summary.roomsCreated).toBe(1);
    expect(result.summary.peakConcurrentRooms).toBe(0);
    expect(result.buckets.reduce((total, bucket) => total + bucket.roomsCreated, 0)).toBe(1);
  });
  it("scopes event totals and connection durations by project and environment", async () => {
    await room();
    await room("room_2", "env_2");
    await room("room_other", "env_other", "project_2");
    await session("s1", "p1", "2026-10-08T11:59:00Z");
    await session("s2", "p2", "2026-10-08T11:58:00Z", "room_2");
    await session("s3", "p3", "2026-10-08T11:00:00Z", "room_other");
    await query(`INSERT INTO usage_event (id, organization_id, project_id, environment_id, metric, value, occurred_at)
      VALUES ('e1', 'org_1', 'project_1', 'env_1', 'sfuIngressBytes', 100, '2026-10-01T12:00:00Z'),
      ('e2', 'org_1', 'project_1', 'env_1', 'sfuIngressBytes', 500, '2026-10-08T12:00:00Z'),
      ('e3', 'org_1', 'project_1', 'env_2', 'sfuIngressBytes', 200, '2026-10-02T12:00:00Z'),
      ('e4', 'org_2', 'project_2', 'env_other', 'sfuIngressBytes', 900, '2026-10-02T12:00:00Z'),
      ('e5', 'org_1', 'project_1', 'env_1', 'audioParticipantSeconds', 12, '2026-10-02T12:00:00Z'),
      ('e6', 'org_1', 'project_1', 'env_1', 'videoParticipantSeconds', 8, '2026-10-02T12:00:00Z'),
      ('e7', 'org_1', 'project_1', 'env_1', 'screenShareSeconds', 5, '2026-10-02T12:00:00Z'),
      ('e8', 'org_1', 'project_1', 'env_1', 'screenShareIngressBytes', 40, '2026-10-02T12:00:00Z'),
      ('e9', 'org_1', 'project_1', 'env_1', 'screenShareEgressBytes', 80, '2026-10-02T12:00:00Z')`);
    const result = await getProjectUsage(
      database.db,
      { ...scope, environmentId: "env_1" },
      "7d",
      now,
    );
    expect(result.summary.participantSeconds).toBe(60);
    expect(result.summary.sfuIngressBytes).toBe(100);
    expect(result.summary.audioParticipantSeconds).toBe(12);
    expect(result.summary.videoParticipantSeconds).toBe(8);
    expect(result.summary.screenShareSeconds).toBe(5);
    expect(result.summary.screenShareIngressBytes).toBe(40);
    expect(result.summary.screenShareEgressBytes).toBe(80);
    expect((await getProjectUsage(database.db, scope, "7d", now)).summary.sfuIngressBytes).toBe(
      300,
    );
  });
  it("serves the real usage calculation through Fastify after checking database membership", async () => {
    await query(
      `INSERT INTO "user" (id, name, email, updated_at) VALUES ('user_1', 'Test', 'test@example.com', now())`,
    );
    await query(
      `INSERT INTO member (id, organization_id, user_id, role) VALUES ('member_1', 'org_1', 'user_1', 'owner')`,
    );
    const app = Fastify();
    registerErrorHandling(app);
    void app.register(reportingRoutes, {
      database: database.db,
      verifyConsoleSession: (headers) =>
        Promise.resolve(headers.get("cookie") === "test=session" ? { userId: "user_1" } : null),
      prefix: "/v1",
    });
    try {
      const response = await app.inject({
        url: "/v1/projects/project_1/usage?environmentId=env_1",
        headers: { cookie: "test=session" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        scope: { ...scope, environmentId: "env_1" },
        summary: { participantSeconds: 0 },
      });
      const denied = await app.inject({
        url: "/v1/projects/project_2/usage",
        headers: { cookie: "test=session" },
      });
      expect(denied.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
  it("records message deltas once and filters them by occurrence time", async () => {
    await room();
    await session("s1", "p1", "2026-10-08T11:59:00Z");
    await query("UPDATE participant_session SET messages_in = 5, messages_out = 7 WHERE id = 's1'");
    await query("UPDATE participant_session SET messages_in = 5, messages_out = 7 WHERE id = 's1'");
    await query("UPDATE participant_session SET messages_in = 8, messages_out = 9 WHERE id = 's1'");
    const result = await getProjectUsage(database.db, scope, "7d", new Date(Date.now() + 1000));
    expect(result.summary.messagesIn).toBe(8);
    expect(result.summary.messagesOut).toBe(9);
    expect(
      (await query("SELECT * FROM usage_event WHERE metric IN ('messagesIn', 'messagesOut')"))
        .length,
    ).toBe(4);
    await query("UPDATE usage_event SET occurred_at = '2026-09-01T00:00:00Z'");
    expect((await getProjectUsage(database.db, scope, "7d", now)).summary.messagesIn).toBe(0);
  });
  it("keeps bucket boundaries in UTC across daylight-saving changes", async () => {
    await query("SET LOCAL TIME ZONE 'America/New_York'");
    const result = await getProjectUsage(
      database.db,
      scope,
      "30d",
      new Date("2026-11-08T12:00:00Z"),
    );
    for (const bucket of result.buckets) {
      expect(Date.parse(bucket.endedAt) - Date.parse(bucket.startedAt)).toBeLessThanOrEqual(
        86_400_000,
      );
    }
    expect(
      result.buckets.reduce(
        (seconds, bucket) =>
          seconds + (Date.parse(bucket.endedAt) - Date.parse(bucket.startedAt)) / 1000,
        0,
      ),
    ).toBe(30 * 86400);
  });
  it("backfills legacy sessions without inventing reconnect or message history", async () => {
    await query("DROP TRIGGER participant_session_usage_history ON participant_session");
    await query("DROP FUNCTION record_participant_session_usage()");
    await query("DROP TABLE participant_connection_interval");
    await query("ALTER TABLE participant_session DROP COLUMN metering_started_at");
    await room();
    await query(
      `INSERT INTO participant (id, room_id, name, joined_at) VALUES ('p1', 'room_1', 'Test', '2026-10-02T10:00:00Z')`,
    );
    await query(`INSERT INTO participant_session (id, participant_id, signaling_node_id, joined_at,
      reconnected_at, disconnected_at, connection_state, connection_seconds, messages_in)
      VALUES ('legacy', 'p1', 'node', '2026-10-02T10:00:00Z', '2026-10-02T10:20:00Z',
        '2026-10-02T10:30:00Z', 'disconnected', 1200, 10)`);
    const migration = await readFile(
      new URL(
        "../../../../../packages/database/migrations/0012_session_usage_history.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) await query(statement);
    const result = await getProjectUsage(database.db, scope, "7d", now);
    expect(result.summary.participantSeconds).toBe(600);
    expect(result.summary.messagesIn).toBe(0);
    expect(result.dataQuality).toEqual({ sessionHistory: "partial", messageHistory: "partial" });
    expect(
      (
        await query(
          "SELECT connection_seconds, messages_in FROM participant_session WHERE id = 'legacy'",
        )
      )[0],
    ).toMatchObject({ connection_seconds: 1200, messages_in: 10 });
  });
});
