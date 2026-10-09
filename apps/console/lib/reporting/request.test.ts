import { afterEach, describe, expect, it, vi } from "vitest";
import { organizationQuotaResponseSchema } from "@relayrtc/validation";
import { fetchReporting, reportingOrigin, ReportingApiError, sessionCookie } from "./request";

const quota = { organizationId: "org_test", status: "unconfigured", limits: [] };

afterEach(() => vi.unstubAllGlobals());

describe("console reporting requests", () => {
  it("uses the configured backend origin and local API port", () => {
    expect(reportingOrigin({ NODE_ENV: "development", API_PORT: "8082" })).toBe(
      "http://localhost:8082",
    );
    expect(reportingOrigin({ NODE_ENV: "production", RELAYRTC_API_URL: "http://api:8080" })).toBe(
      "http://api:8080",
    );
  });
  it.each([
    "file:///tmp/data",
    "https://user:password@example.com",
    "http://api:8080/v1",
    "http://api:8080?secret=1",
    "http://api:8080/#fragment",
    "invalid",
  ])("rejects unsafe or malformed origins: %s", (url) => {
    expect(() => reportingOrigin({ NODE_ENV: "development", RELAYRTC_API_URL: url })).toThrow(
      ReportingApiError,
    );
  });
  it("requires explicit backend configuration in production", () => {
    expect(() => reportingOrigin({ NODE_ENV: "production" })).toThrow(ReportingApiError);
  });
  it("forwards only session tokens, disables caching and refuses redirects", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(quota));
    vi.stubGlobal("fetch", fetch);
    expect(
      await fetchReporting(
        "/v1/organizations/org_test/quota",
        organizationQuotaResponseSchema,
        "other=secret; better-auth.session_token=signed; better-auth.session_data=cached",
        "http://api:8080",
      ),
    ).toEqual(quota);
    const [url, options] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("http://api:8080/v1/organizations/org_test/quota");
    expect(options).toMatchObject({
      headers: { cookie: "better-auth.session_token=signed" },
      cache: "no-store",
      redirect: "error",
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("preserves secure session tokens without forwarding unrelated cookies", () => {
    expect(
      sessionCookie(
        "__Secure-better-auth.session_token=signed; tracking=user; __Secure-better-auth.session_data=cached",
      ),
    ).toBe("__Secure-better-auth.session_token=signed");
  });
  it.each([401, 403, 404, 500, 503])(
    "preserves status %i for access and availability handling",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("private backend error", { status })),
      );
      await expect(
        fetchReporting(
          "/v1/organizations/org_test/quota",
          organizationQuotaResponseSchema,
          "",
          "http://api:8080",
        ),
      ).rejects.toMatchObject({
        status,
        message: "Reporting is temporarily unavailable. Please try again.",
      });
    },
  );
  it("rejects malformed API responses instead of inventing empty usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ organizationId: "org_test", status: "configured", limits: [] }),
        ),
    );
    await expect(
      fetchReporting(
        "/v1/organizations/org_test/quota",
        organizationQuotaResponseSchema,
        "",
        "http://api:8080",
      ),
    ).rejects.toBeInstanceOf(ReportingApiError);
  });
  it("hides network failures and request secrets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("signed-cookie-secret")));
    await expect(
      fetchReporting(
        "/v1/organizations/org_test/quota",
        organizationQuotaResponseSchema,
        "",
        "http://api:8080",
      ),
    ).rejects.toThrow("Reporting is temporarily unavailable. Please try again.");
  });
  it.each(["//external.example/v1/data", "/v1/../private", "/v1/\\external"])(
    "rejects unsafe paths before sending cookies: %s",
    async (path) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await expect(
        fetchReporting(path, organizationQuotaResponseSchema, "secret", "http://api:8080"),
      ).rejects.toBeInstanceOf(ReportingApiError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
