import type { Transaction, TransactionLog } from "./types";

const DEPLOY_KEY_HEADER = "x-crawlpay-deploy-key";

export interface HttpTransactionLogOptions {
  /** Base URL of the phase 6 publisher dashboard, e.g. "https://dashboard.crawlpay.com". */
  dashboardUrl: string;
  /** This site's id in the dashboard's database. */
  siteId: string;
  /** Sent as X-Crawlpay-Deploy-Key; must match the site's middlewareDeployKey in the dashboard. */
  deployKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Pushes each transaction to the phase 6 dashboard's
 * POST /api/internal/sites/:siteId/transactions instead of (or alongside)
 * ConsoleTransactionLog. record() rejects on any failure, same contract as
 * PostgresTransactionLog — both server.ts call sites already wrap
 * transactionLog.record() in a try/catch that only logs the error, so a
 * dashboard outage never turns an already-verified payment into a failed
 * request for the crawler that paid for it.
 */
export class HttpTransactionLog implements TransactionLog {
  private readonly endpoint: string;
  private readonly deployKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpTransactionLogOptions) {
    this.endpoint = new URL(
      `/api/internal/sites/${options.siteId}/transactions`,
      options.dashboardUrl,
    ).toString();
    this.deployKey = options.deployKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async record(transaction: Transaction): Promise<void> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [DEPLOY_KEY_HEADER]: this.deployKey,
      },
      body: JSON.stringify({
        timestamp: transaction.timestamp.toISOString(),
        url: transaction.url,
        botClassification: transaction.botClassification,
        amount: transaction.amount,
        payer: transaction.payer,
      }),
    });

    if (!response.ok) {
      throw new Error(`dashboard transactions endpoint returned ${response.status}`);
    }
  }
}
