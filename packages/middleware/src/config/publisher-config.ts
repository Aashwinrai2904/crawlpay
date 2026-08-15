import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PolicyConfigSchema } from "../bot-detection/types";

export const PricingConfigSchema = z.object({
  network: z.string(),
  asset: z.string(),
  /** Flat per-request price, atomic units of `asset` (dynamic pricing is Phase 7). */
  maxAmountRequired: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().int().positive(),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export const PublisherConfigSchema = z.object({
  policy: PolicyConfigSchema,
  pricing: PricingConfigSchema,
});
export type PublisherConfig = z.infer<typeof PublisherConfigSchema>;

const DEFAULT_CONFIG_PATH = join(__dirname, "..", "..", "config", "publisher-config.json");

/**
 * Loads publisher policy + pricing from a local JSON file. server.ts only
 * ever sees the returned PublisherConfig — swapping this for a
 * database-backed lookup later means changing this function's body, not
 * any of its callers.
 */
export function loadPublisherConfig(filePath: string = DEFAULT_CONFIG_PATH): PublisherConfig {
  const raw = readFileSync(filePath, "utf8");
  return PublisherConfigSchema.parse(JSON.parse(raw));
}
