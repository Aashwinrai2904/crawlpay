import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ANALYTICS, fetchSiteAnalytics } from "./analytics";

const MIDDLEWARE_RESPONSE = {
  siteId: "site-1",
  hours: 24,
  since: "2026-09-09T00:00:00.000Z",
  totals: { requests: 3, allow: 1, charge402: 1, block: 1, paid: 0 },
  byBot: [{ botName: "GPTBot", requests: 2, allow: 0, charge402: 1, block: 1, paid: 0, pages: 2 }],
  byPage: [{ resource: "/a", requests: 2, allow: 1, charge402: 1, block: 0, paid: 0 }],
  byHour: [
    { hour: "2026-09-09T12:00:00.000Z", requests: 3, allow: 1, charge402: 1, block: 1, paid: 0 },
  ],
  heatmap: [{ botName: "GPTBot", resource: "/a", requests: 2 }],
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(outcome: Response | Error) {
  return vi.fn<FetchLike>(() =>
    outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome),
  );
}

function run(fetchImpl: ReturnType<typeof mockFetch>) {
  return fetchSiteAnalytics("site-1", 24, fetchImpl as unknown as typeof fetch);
}

beforeEach(() => {
  vi.stubEnv("CRAWLPAY_MIDDLEWARE_URL", "https://mw.example.test");
  vi.stubEnv("CRAWLPAY_MIDDLEWARE_SITE_KEY", "secret-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fetchSiteAnalytics", () => {
  it("calls the middleware with the site key and returns the parsed roll-up", async () => {
    const fetchImpl = mockFetch(jsonResponse(MIDDLEWARE_RESPONSE));

    const result = await run(fetchImpl);

    const call = fetchImpl.mock.calls.at(0);
    expect(call?.[0]).toBe(
      "https://mw.example.test/api/v1/analytics/requests?siteId=site-1&hours=24",
    );
    expect(call?.[1]).toMatchObject({ headers: { "x-crawlpay-site-key": "secret-key" } });
    expect(result.degraded).toBe(false);
    expect(result.totals.requests).toBe(3);
    expect(result.byBot.map((b) => b.botName)).toEqual(["GPTBot"]);
    expect(result.heatmap).toHaveLength(1);
  });

  it("degrades to an empty roll-up when the middleware env vars are unset", async () => {
    vi.stubEnv("CRAWLPAY_MIDDLEWARE_URL", "");
    const fetchImpl = mockFetch(jsonResponse(MIDDLEWARE_RESPONSE));

    const result = await run(fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toContain("CRAWLPAY_MIDDLEWARE_URL");
    expect(result).toMatchObject(EMPTY_ANALYTICS);
  });

  it("degrades on a non-OK response", async () => {
    const result = await run(mockFetch(jsonResponse("nope", 502)));
    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toContain("502");
  });

  it("degrades when the middleware is unreachable", async () => {
    const result = await run(mockFetch(new Error("ECONNREFUSED")));
    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toContain("ECONNREFUSED");
  });

  it("degrades when the response shape is wrong", async () => {
    const result = await run(mockFetch(jsonResponse({ totals: "not an object" })));
    expect(result.degraded).toBe(true);
  });
});
