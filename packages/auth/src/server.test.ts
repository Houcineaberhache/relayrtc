import { createDatabase } from "@relaykit/database";
import { describe, expect, it } from "vitest";

import { createRelayKitAuth } from "./server.js";

describe("createRelayKitAuth", () => {
  it("creates a database-backed Better Auth instance", async () => {
    const database = createDatabase("postgresql://relaykit:password@127.0.0.1:1/relaykit");
    const auth = createRelayKitAuth({
      baseUrl: "http://localhost:3000",
      database: database.db,
      secret: "0123456789abcdef0123456789abcdef",
    });

    expect(auth.options.appName).toBe("RelayKit");
    expect(auth.options.baseURL).toBe("http://localhost:3000");
    expect("emailAndPassword" in auth.options).toBe(false);
    expect("socialProviders" in auth.options).toBe(false);

    await database.close();
  });
});
