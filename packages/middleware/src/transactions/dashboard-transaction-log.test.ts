import { describe, expect, it, vi } from "vitest";
import { DashboardTransactionLog } from "./dashboard-transaction-log";
import type { Transaction } from "./types";

const TRANSACTION: Transaction = {
  timestamp: new Date("2026-08-17T00:00:00.000Z"),
  url: "https://example.test/premium",
  botClassification: "ai-crawler",
  amount: "10000",
  payer: "0xPAYER",
  facilitatorResponse: { valid: true, amount: "10000", payer: "0xPAYER" },
};

describe("DashboardTransactionLog", () => {
  it("POSTs the transaction with a Bearer deploy key", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 201 }));

    const log = new DashboardTransactionLog({
      dashboardUrl: "https://dashboard.example.test",
      deployKey: "top-secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await log.record(TRANSACTION);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashboard.example.test/api/v1/transactions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer top-secret",
        },
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://example.test/premium",
      botClassification: "ai-crawler",
      amount: "10000",
      payer: "0xPAYER",
      occurredAt: "2026-08-17T00:00:00.000Z",
    });
  });

  it("rejects when the dashboard responds with a non-ok status", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 500 }),
    ) as unknown as typeof fetch;

    const log = new DashboardTransactionLog({
      dashboardUrl: "https://dashboard.example.test",
      deployKey: "top-secret",
      fetchImpl,
    });

    await expect(log.record(TRANSACTION)).rejects.toThrow(/500/);
  });
});
