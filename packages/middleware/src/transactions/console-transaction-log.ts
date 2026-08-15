import type { Transaction, TransactionLog } from "./types";

export class ConsoleTransactionLog implements TransactionLog {
  async record(transaction: Transaction): Promise<void> {
    console.log(
      "[transaction]",
      JSON.stringify({ ...transaction, timestamp: transaction.timestamp.toISOString() }),
    );
  }
}
