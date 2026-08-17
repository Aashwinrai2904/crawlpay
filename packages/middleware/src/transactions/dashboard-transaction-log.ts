import type { Transaction, TransactionLog } from "./types";

export interface DashboardTransactionLogOptions {
  dashboardUrl: string;
  deployKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Pushes each transaction to the Phase 6 publisher dashboard's internal
 * API, in addition to (not instead of) Console/PostgresTransactionLog --
 * this is what feeds the dashboard's revenue chart. A rejection here is
 * safe: CompositeTransactionLog fans record() out to every log with
 * Promise.all, so the other logs' work isn't undone, and server.ts already
 * treats the composite's record() failures as non-fatal to the response.
 */
export class DashboardTransactionLog implements TransactionLog {
  private readonly endpoint: string;
  private readonly deployKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DashboardTransactionLogOptions) {
    this.endpoint = new URL("/api/v1/transactions", options.dashboardUrl).toString();
    this.deployKey = options.deployKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async record(transaction: Transaction): Promise<void> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.deployKey}`,
      },
      body: JSON.stringify({
        url: transaction.url,
        botClassification: transaction.botClassification,
        amount: transaction.amount,
        payer: transaction.payer,
        occurredAt: transaction.timestamp.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`dashboard transaction push failed: ${response.status}`);
    }
  }
}
