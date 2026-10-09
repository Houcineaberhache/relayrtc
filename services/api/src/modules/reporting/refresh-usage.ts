import { createDatabase } from "@relayrtc/database";
import { organizationIdSchema } from "@relayrtc/validation";
import { refreshUsageAggregates } from "./usage-aggregation.service.js";

const organizationId = organizationIdSchema.parse(process.argv[2]);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const endedAt = new Date();
const startedAt = new Date(endedAt.getTime() - 30 * 86400_000);
const database = createDatabase(databaseUrl);
try {
  await refreshUsageAggregates(database.db, organizationId, startedAt, endedAt);
  console.log(JSON.stringify({ organizationId, status: "refreshed", startedAt, endedAt }));
} finally {
  await database.close();
}
