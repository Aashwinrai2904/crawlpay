import { Pool } from "pg";
import type { Transaction, TransactionLog } from "./types";

/** Minimal structural subset of pg's Pool/Client — a real Pool satisfies this without an adapter. */
export interface PgLikeClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

const DEFAULT_DATABASE_URL =
  process.env.CRAWLPAY_DATABASE_URL ?? "postgres://crawlpay:crawlpay@localhost:5432/crawlpay";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  "timestamp" TIMESTAMPTZ NOT NULL,
  url TEXT NOT NULL,
  bot_classification TEXT NOT NULL,
  amount TEXT NOT NULL,
  payer TEXT NOT NULL,
  facilitator_response JSONB NOT NULL
)`;

const INSERT_SQL = `
INSERT INTO transactions (timestamp, url, bot_classification, amount, payer, facilitator_response)
VALUES ($1, $2, $3, $4, $5, $6)`;

/**
 * "For now" per the spec: a bare CREATE TABLE IF NOT EXISTS on first use,
 * not a real migration. Revisit once there's an actual migration tool in
 * the stack.
 */
export class PostgresTransactionLog implements TransactionLog {
  private schemaReady: Promise<void> | null = null;

  constructor(
    private readonly client: PgLikeClient = new Pool({ connectionString: DEFAULT_DATABASE_URL }),
  ) {}

  async record(transaction: Transaction): Promise<void> {
    await this.ensureSchema();
    await this.client.query(INSERT_SQL, [
      transaction.timestamp,
      transaction.url,
      transaction.botClassification,
      transaction.amount,
      transaction.payer,
      JSON.stringify(transaction.facilitatorResponse),
    ]);
  }

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.client.query(CREATE_TABLE_SQL).then(() => undefined);
    return this.schemaReady;
  }
}
