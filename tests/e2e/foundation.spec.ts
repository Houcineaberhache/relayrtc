import { expect, test } from "@playwright/test";

test("loads the Playwright test environment", () => {
  expect(test.info().project.name).toBe("chromium");
});
