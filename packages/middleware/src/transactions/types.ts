import type { VerificationResult } from "@crawlpay/core";
import type { BotClassification } from "../bot-detection/types";

export interface Transaction {
  timestamp: Date;
  url: string;
  botClassification: BotClassification;
  amount: string;
  payer: string;
  facilitatorResponse: VerificationResult;
}

export interface TransactionLog {
  record(transaction: Transaction): Promise<void>;
}
