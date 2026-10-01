import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export interface DatabaseOptions {
  maxConnections?: number;
}

export const createDatabase = (databaseUrl: string, options: DatabaseOptions = {}) => {
  const client = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: options.maxConnections ?? 10,
  });
  const db = drizzle({ client, schema });

  return {
    client,
    db,
    close: async (): Promise<void> => {
      await client.end();
    },
  };
};

export type DatabaseConnection = ReturnType<typeof createDatabase>;
export type RelayKitDatabase = DatabaseConnection["db"];
