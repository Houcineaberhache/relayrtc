import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createTurnCredentialService } from "./turn-credential.service.js";

describe("TURN credential service", () => {
  it("issues scoped short-lived credentials accepted by coturn REST auth", () => {
    const secret = "a-secure-turn-shared-secret-value";
    const service = createTurnCredentialService({
      clock: () => new Date("2026-10-03T12:00:00.900Z"),
      createId: () => "credential-id",
      secret,
      stunUrls: ["stun:turn.example.com:3478"],
      ttlSeconds: 600,
      turnUrls: [
        "turn:turn.example.com:3478?transport=udp",
        "turns:turn.example.com:5349?transport=tcp",
      ],
    });

    const result = service.issue({
      environmentId: "env_development",
      projectId: "project_123",
    });
    const expectedCredential = createHmac("sha1", secret).update(result.username).digest("base64");

    expect(result).toEqual({
      expiresAt: "2026-10-03T12:10:00.000Z",
      iceServers: [
        { urls: ["stun:turn.example.com:3478"] },
        {
          credential: expectedCredential,
          credentialType: "password",
          urls: [
            "turn:turn.example.com:3478?transport=udp",
            "turns:turn.example.com:5349?transport=tcp",
          ],
          username: result.username,
        },
      ],
      ttlSeconds: 600,
      username: "1791029400:project_123:env_development:credential-id",
    });
  });

  it("creates a distinct username for every credential", () => {
    const ids = ["first", "second"];
    const service = createTurnCredentialService({
      createId: () => ids.shift() ?? "fallback",
      secret: "a-secure-turn-shared-secret-value",
      stunUrls: ["stun:localhost:3478"],
      ttlSeconds: 300,
      turnUrls: ["turn:localhost:3478?transport=udp"],
    });

    const scope = { environmentId: "env_dev", projectId: "project_123" };
    expect(service.issue(scope).username).not.toBe(service.issue(scope).username);
  });
});
