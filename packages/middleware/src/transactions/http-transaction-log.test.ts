import { describe, expect, it, vi } from "vitest";
import { HttpTransactionLog } from "./http-transaction-log";
import type { Transaction } from "./types";

const TRANSACTION: Transaction = {
  timestamp: new Date("2026-08-24T00:00:00.000Z"),
  url: "https://example.test/article",
  botClassification: "ai-crawler",
  amount: "10000",
  payer: "0xPAYER",
  facilitatorResponse: { valid: true },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("HttpTransactionLog", () => {
  it("posts to the dashboard's internal transactions endpoint with the deploy key header", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ ok: true }, true, 201),
    );

    const log = new HttpTransactionLog({
      dashboardUrl: "https://dashboard.example.test",
      siteId: "site_123",
      deployKey: "top-secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await log.record(TRANSACTION);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dashboard.example.test/api/internal/sites/site_123/transactions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-crawlpay-deploy-key": "top-secret" }),
      }),
    );
    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toEqual({
      timestamp: "2026-08-24T00:00:00.000Z",
      url: TRANSACTION.url,
      botClassification: TRANSACTION.botClassification,
      amount: TRANSACTION.amount,
      payer: TRANSACTION.payer,
    });
  });

  it("rejects when the dashboard responds with a non-ok status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 401)) as unknown as typeof fetch;
    const log = new HttpTransactionLog({
      dashboardUrl: "https://dashboard.example.test",
      siteId: "site_123",
      deployKey: "top-secret",
      fetchImpl,
    });

    await expect(log.record(TRANSACTION)).rejects.toThrow(/401/);
  });

  it("rejects when the underlying fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;
    const log = new HttpTransactionLog({
      dashboardUrl: "https://dashboard.example.test",
      siteId: "site_123",
      deployKey: "top-secret",
      fetchImpl,
    });

    await expect(log.record(TRANSACTION)).rejects.toThrow("network error");
  });
});
