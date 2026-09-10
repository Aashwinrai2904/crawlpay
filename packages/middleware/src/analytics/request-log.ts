import { Pool } from "pg";
import type { BotClassification } from "../bot-detection/types";
import type { PgLikeClient } from "../transactions/postgres-transaction-log";

/**
 * One row per request the middleware classified, regardless of outcome
 * (allow / block / 402 / paid). This is the raw feed the dashboard's
 * bot-traffic analytics view aggregates -- distinct from the transaction
 * log, which only ever records *paid* requests.
 */
export interface RequestLogEntry {
  timestamp: Date;
  /**
   * Which dashboard Site this deployment serves, if configured
   * (CRAWLPAY_SITE_ID / buildServer's `siteId`). Null for a standalone
   * middleware that hasn't been told which site it fronts.
   */
  siteId: string | null;
  /** Named crawler ("GPTBot", "Googlebot", ...) or "unknown-bot" / "human". */
  botName: string;
  /** Path + query as the caller requested it (no scheme/host). */
  resource: string;
  classification: BotClassification;
  /** HTTP status the middleware returned for this request. */
  responseCode: number;
}

export interface RequestLogQuery {
  /** Restrict to one site. Omit to return every site's rows. */
  siteId?: string | null;
  /** Only rows at or after this instant. */
  since: Date;
}

export interface RequestLog {
  record(entry: RequestLogEntry): Promise<void>;
  query(query: RequestLogQuery): Promise<RequestLogEntry[]>;
}

interface PgRowsResult {
  rows: Array<{
    timestamp: Date | string;
    site_id: string | null;
    bot_name: string;
    resource: string;
    classification: string;
    response_code: number;
  }>;
}

const DEFAULT_DATABASE_URL =
  process.env.CRAWLPAY_DATABASE_URL ?? "postgres://crawlpay:crawlpay@localhost:5432/crawlpay";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS request_log (
  id BIGSERIAL PRIMARY KEY,
  "timestamp" TIMESTAMPTZ NOT NULL,
  site_id TEXT,
  bot_name TEXT NOT NULL,
  resource TEXT NOT NULL,
  classification TEXT NOT NULL,
  response_code INTEGER NOT NULL
)`;

const CREATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS request_log_site_ts_idx
  ON request_log (site_id, "timestamp" DESC)`;

const INSERT_SQL = `
INSERT INTO request_log (timestamp, site_id, bot_name, resource, classification, response_code)
VALUES ($1, $2, $3, $4, $5, $6)`;

/**
 * Same "bare CREATE TABLE IF NOT EXISTS on first use, not a real
 * migration" approach as PostgresTransactionLog -- the middleware has no
 * migration tool in its stack. Writes are best-effort: callers fire
 * record() without awaiting and swallow rejections, so a logging outage
 * never affects the response to a crawler.
 */
export class PostgresRequestLog implements RequestLog {
  private schemaReady: Promise<void> | null = null;

  constructor(
    private readonly client: PgLikeClient = new Pool({ connectionString: DEFAULT_DATABASE_URL }),
  ) {}

  async record(entry: RequestLogEntry): Promise<void> {
    await this.ensureSchema();
    await this.client.query(INSERT_SQL, [
      entry.timestamp,
      entry.siteId,
      entry.botName,
      entry.resource,
      entry.classification,
      entry.responseCode,
    ]);
  }

  async query(query: RequestLogQuery): Promise<RequestLogEntry[]> {
    await this.ensureSchema();
    const filters = ['"timestamp" >= $1'];
    const values: unknown[] = [query.since];
    if (query.siteId != null) {
      values.push(query.siteId);
      filters.push(`site_id = $${values.length}`);
    }
    const result = (await this.client.query(
      `SELECT "timestamp", site_id, bot_name, resource, classification, response_code
       FROM request_log
       WHERE ${filters.join(" AND ")}
       ORDER BY "timestamp" DESC
       LIMIT 100000`,
      values,
    )) as PgRowsResult;

    return result.rows.map((row) => ({
      timestamp: row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
      siteId: row.site_id,
      botName: row.bot_name,
      resource: row.resource,
      classification: row.classification as BotClassification,
      responseCode: row.response_code,
    }));
  }

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.client
      .query(CREATE_TABLE_SQL)
      .then(() => this.client.query(CREATE_INDEX_SQL))
      .then(() => undefined);
    return this.schemaReady;
  }
}

/** In-process store: the default when no Postgres URL is reachable, and what tests inject. */
export class InMemoryRequestLog implements RequestLog {
  private readonly entries: RequestLogEntry[] = [];

  async record(entry: RequestLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async query(query: RequestLogQuery): Promise<RequestLogEntry[]> {
    return this.entries.filter(
      (entry) =>
        entry.timestamp >= query.since &&
        (query.siteId == null || entry.siteId === query.siteId),
    );
  }

  get size(): number {
    return this.entries.length;
  }
}

/** Discards everything -- used when request logging is explicitly disabled. */
export class NullRequestLog implements RequestLog {
  async record(): Promise<void> {
    // intentionally empty
  }

  async query(): Promise<RequestLogEntry[]> {
    return [];
  }
}
