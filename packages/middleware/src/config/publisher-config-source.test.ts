import { describe, expect, it, vi } from "vitest";
import type { PublisherConfig } from "./publisher-config";
import {
  DashboardPublisherConfigSource,
  StaticPublisherConfigSource,
  WordPressPublisherConfigSource,
} from "./publisher-config-source";

const FALLBACK: PublisherConfig = {
  policy: {
    human: "allow",
    "search-crawler": "allow",
    "ai-crawler": "block",
    "unknown-bot": "block",
  },
  pricing: {
    network: "base-sepolia",
    asset: "USDC",
    maxAmountRequired: "1",
    payTo: "0xFALLBACK",
    maxTimeoutSeconds: 60,
  },
};

const FROM_WORDPRESS: PublisherConfig = {
  policy: {
    human: "allow",
    "search-crawler": "allow",
    "ai-crawler": "charge",
    "unknown-bot": "block",
  },
  pricing: {
    network: "base-sepolia",
    asset: "USDC",
    maxAmountRequired: "25000",
    payTo: "0xFROMWORDPRESS",
    maxTimeoutSeconds: 60,
  },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("StaticPublisherConfigSource", () => {
  it("always returns the config it was constructed with", () => {
    const source = new StaticPublisherConfigSource(FALLBACK);
    expect(source.getConfig()).toBe(FALLBACK);
  });
});

describe("WordPressPublisherConfigSource", () => {
  it("serves the fallback until the first poll resolves", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    ) as unknown as typeof fetch;

    const source = new WordPressPublisherConfigSource({
      wordpressUrl: "https://example.test",
      fallback: FALLBACK,
      fetchImpl,
      pollIntervalMs: 1_000_000,
    });

    expect(source.getConfig()).toBe(FALLBACK);

    resolveFetch(jsonResponse(FROM_WORDPRESS));
    await vi.waitFor(() => expect(source.getConfig()).toEqual(FROM_WORDPRESS));

    source.stop();
  });

  it("requests the plugin's config route with the site key header", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FROM_WORDPRESS)) as unknown as typeof fetch;

    const source = new WordPressPublisherConfigSource({
      wordpressUrl: "https://example.test",
      siteKey: "top-secret",
      fallback: FALLBACK,
      fetchImpl,
      pollIntervalMs: 1_000_000,
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/wp-json/crawlpay/v1/config", {
      headers: { "x-crawlpay-site-key": "top-secret" },
    });

    source.stop();
  });

  it("keeps serving the last-known-good config when a later poll fails", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse(FROM_WORDPRESS);
      }
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const onPollError = vi.fn();
    const source = new WordPressPublisherConfigSource({
      wordpressUrl: "https://example.test",
      fallback: FALLBACK,
      fetchImpl,
      onPollError,
      pollIntervalMs: 10,
    });

    await vi.waitFor(() => expect(source.getConfig()).toEqual(FROM_WORDPRESS));
    await vi.waitFor(() => expect(onPollError).toHaveBeenCalled());
    expect(source.getConfig()).toEqual(FROM_WORDPRESS);

    source.stop();
  });

  it("keeps serving the fallback and reports an error when a non-ok response is returned", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 401)) as unknown as typeof fetch;
    const onPollError = vi.fn();

    const source = new WordPressPublisherConfigSource({
      wordpressUrl: "https://example.test",
      fallback: FALLBACK,
      fetchImpl,
      onPollError,
      pollIntervalMs: 1_000_000,
    });

    await vi.waitFor(() => expect(onPollError).toHaveBeenCalled());
    expect(source.getConfig()).toBe(FALLBACK);

    source.stop();
  });

  it("keeps serving the last-known-good config when a response fails schema validation", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ garbage: true })) as unknown as typeof fetch;
    const onPollError = vi.fn();

    const source = new WordPressPublisherConfigSource({
      wordpressUrl: "https://example.test",
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

describe("DashboardPublisherConfigSource", () => {
  it("serves the fallback until the first poll resolves", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    ) as unknown as typeof fetch;

    const source = new DashboardPublisherConfigSource({
      dashboardUrl: "https://dashboard.example.test",
      siteId: "site_123",
      deployKey: "top-secret",
      fallback: FALLBACK,
      fetchImpl,
      pollIntervalMs: 1_000_000,
    });

    expect(source.getConfig()).toBe(FALLBACK);

    resolveFetch(jsonResponse(FROM_WORDPRESS));
    await vi.waitFor(() => expect(source.getConfig()).toEqual(FROM_WORDPRESS));

    source.stop();
  });

  it("requests this site's config route with the deploy key header", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FROM_WORDPRESS)) as unknown as typeof fetch;

    const source = new DashboardPublisherConfigSource({
      dashboardUrl: "https://dashboard.example.test",
      siteId: "site_123",
      deployKey: "top-secret",
      fallback: FALLBACK,
      fetchImpl,
      pollIntervalMs: 1_000_000,
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dashboard.example.test/api/internal/sites/site_123/config",
      { headers: { "x-crawlpay-deploy-key": "top-secret" } },
    );

    source.stop();
  });

  it("keeps serving the last-known-good config when the dashboard is unreachable", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse(FROM_WORDPRESS);
      }
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const onPollError = vi.fn();
    const source = new DashboardPublisherConfigSource({
      dashboardUrl: "https://dashboard.example.test",
      siteId: "site_123",
      deployKey: "top-secret",
      fallback: FALLBACK,
      fetchImpl,
      onPollError,
      pollIntervalMs: 10,
    });

    await vi.waitFor(() => expect(source.getConfig()).toEqual(FROM_WORDPRESS));
    await vi.waitFor(() => expect(onPollError).toHaveBeenCalled());
    expect(source.getConfig()).toEqual(FROM_WORDPRESS);

    source.stop();
  });
});
