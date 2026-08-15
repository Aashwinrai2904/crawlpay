import type { BotClassification } from "../bot-detection";

interface ClassificationStats {
  count: number;
  totalAmount: bigint;
}

export interface ClassificationStatsSnapshot {
  classification: BotClassification;
  count: number;
  totalAmount: string;
}

/**
 * In-memory, since-process-start counters — a stub per Phase 5's spec, not
 * a query over persisted history. A real historical view would read the
 * Postgres transactions table instead.
 */
class TransactionMetrics {
  private readonly byClassification = new Map<BotClassification, ClassificationStats>();

  record(classification: BotClassification, amount: string): void {
    const current = this.byClassification.get(classification) ?? { count: 0, totalAmount: 0n };
    current.count += 1;
    try {
      current.totalAmount += BigInt(amount);
    } catch {
      // non-numeric amount string: still counted, just not added to the total
    }
    this.byClassification.set(classification, current);
  }

  reset(): void {
    this.byClassification.clear();
  }

  snapshot(): ClassificationStatsSnapshot[] {
    return [...this.byClassification.entries()].map(([classification, stats]) => ({
      classification,
      count: stats.count,
      totalAmount: stats.totalAmount.toString(),
    }));
  }
}

export const transactionMetrics = new TransactionMetrics();
