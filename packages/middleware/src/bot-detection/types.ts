import { z } from "zod";

export const BotClassificationSchema = z.enum([
  "human",
  "search-crawler",
  "ai-crawler",
  "unknown-bot",
]);
export type BotClassification = z.infer<typeof BotClassificationSchema>;

export const BotSignatureEntrySchema = z.object({
  name: z.string(),
  /** Regex source, matched case-insensitively against the raw User-Agent string. */
  userAgentPattern: z.string(),
});
export type BotSignatureEntry = z.infer<typeof BotSignatureEntrySchema>;

export const BotSignatureConfigSchema = z.object({
  aiCrawlers: z.array(BotSignatureEntrySchema),
  searchCrawlers: z.array(BotSignatureEntrySchema),
});
export type BotSignatureConfig = z.infer<typeof BotSignatureConfigSchema>;

export const PolicyActionSchema = z.enum(["allow", "charge", "block"]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

export const PolicyConfigSchema = z.object({
  human: PolicyActionSchema,
  "search-crawler": PolicyActionSchema,
  "ai-crawler": PolicyActionSchema,
  "unknown-bot": PolicyActionSchema,
});
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export interface BotAuthVerifyRequest {
  headers: Record<string, string>;
  method: string;
  url: string;
  body?: string;
}

export interface BotAuthVerifyResult {
  verified: boolean;
  keyId?: string;
  reason?: string;
}
