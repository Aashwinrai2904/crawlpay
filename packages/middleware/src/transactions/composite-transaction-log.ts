import type { Transaction, TransactionLog } from "./types";

/** Fans a single record() out to every child log — used to satisfy "console.log + a Postgres insert". */
export class CompositeTransactionLog implements TransactionLog {
  constructor(private readonly logs: TransactionLog[]) {}

  async record(transaction: Transaction): Promise<void> {
    await Promise.all(this.logs.map((log) => log.record(transaction)));
  }
}
