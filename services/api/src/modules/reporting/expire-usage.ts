import { createDatabase } from "@relayrtc/database";
import { expireUsageHistory, readUsageRetentionDays } from "./usage-retention.service.js";

const retentionDays = readUsageRetentionDays(process.env);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const database = createDatabase(process.env.DATABASE_URL);
try {
  console.log(JSON.stringify(await expireUsageHistory(database.db, retentionDays)));
} finally {
  await database.close();
}
