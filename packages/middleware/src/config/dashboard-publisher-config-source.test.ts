import { describe, expect, it, vi } from "vitest";
import { DashboardPublisherConfigSource } from "./dashboard-publisher-config-source";
import type { PublisherConfig } from "./publisher-config";

const FALLBACK: PublisherConfig = {
  policy: { human: "allow", "search-crawler": "allow", "ai-crawler": "block", "unknown-bot": "block" },
  pricing: {
    network: "base-sepolia",
    asset: "USDC",
    maxAmountRequired: "1",
    payTo: "0xFALLBACK",
    maxTimeoutSeconds: 60,
  },
};

const FROM_DASHBOARD: PublisherConfig = {
  policy: { human: "allow", "search-crawler": "allow", "ai-crawler": "charge", "unknown-bot": "block" },
  pricing: {
    network: "base-sepolia",
    asset: "USDC",
    maxAmountRequired: "50000",
    payTo: "0xFROMDASHBOARD",
    maxTimeoutSeconds: 60,
  },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("DashboardPublisherConfigSource", () => {
  it("serves the fallback until the first poll resolves, then the fetched config", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FROM_DASHBOARD)) as unknown as typeof fetch;

    const source = new DashboardPublisherConfigSource({
      dashboardUrl: "https://dashboard.example.test",
      deployKey: "top-secret",
      fallback: FALLBACK,
      fetchImpl,
      pollIntervalMs: 1_000_000,
    });

    await vi.waitFor(() => expect(source.getConfig()).toEqual(FROM_DASHBOARD));

    source.stop();
  });

  it("requests the internal config route with a Bearer deploy key", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FROM_DASHBOARD)) as unknown as typeof fetch;

    const source = new DashboardPublisherConfigSource({
      dashboardUrl: "https://dashboard.example.test",
      deployKey: "top-secret",
      fallback: FALLBACK,
      fetchImpl,
      pollIntervalMs: 1_000_000,
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(fetchImpl).toHaveBeenCalledWith("https://dashboard.example.test/api/v1/config", {
      headers: { authorization: "Bearer top-secret" },
    });

    source.stop();
  });

  it("keeps serving the last-known-good config when a later poll fails", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse(FROM_DASHBOARD);
      }
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const onPollError = vi.fn();
    const source = new DashboardPublisherConfigSource({
      dashboardUrl: "https://dashboard.example.test",
      deployKey: "top-secret",
      fallback: FALLBACK,
      fetchImpl,
      onPollError,
      pollIntervalMs: 10,
    });

    await vi.waitFor(() => expect(source.getConfig()).toEqual(FROM_DASHBOARD));
    await vi.waitFor(() => expect(onPollError).toHaveBeenCalled());
    expect(source.getConfig()).toEqual(FROM_DASHBOARD);

    source.stop();
  });

  it("keeps serving the fallback and reports an error on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 401)) as unknown as typeof fetch;
    const onPollError = vi.fn();

    const source = new DashboardPublisherConfigSource({
      dashboardUrl: "https://dashboard.example.test",
      deployKey: "top-secret",
      fallback: FALLBACK,
      fetchImpl,
      onPollError,
      pollIntervalMs: 1_000_000,
    });

    await vi.waitFor(() => expect(onPollError).toHaveBeenCalled());
    expect(source.getConfig()).toBe(FALLBACK);

    source.stop();
  });
});
