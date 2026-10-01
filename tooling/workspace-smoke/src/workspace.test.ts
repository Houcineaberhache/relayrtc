import { describe, expect, it } from "vitest";

import { isRelayKitWorkspace, workspaceName } from "./workspace.js";

describe("workspace foundation", () => {
  it("identifies the RelayKit workspace", () => {
    expect(isRelayKitWorkspace(workspaceName)).toBe(true);
    expect(isRelayKitWorkspace("other")).toBe(false);
  });
});
