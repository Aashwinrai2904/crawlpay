import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findHeader } from "@crawlpay/core";
import { BotSignatureConfigSchema } from "./types";
import type { BotClassification, BotSignatureConfig, BotSignatureEntry } from "./types";

const DEFAULT_CONFIG_PATH = join(__dirname, "..", "..", "config", "bot-signatures.json");

// Substring, not \b-bounded: real bot UAs commonly concatenate tokens in
// CamelCase (e.g. "SomeCrawler") with no word boundary a regex would see.
/** Generic tokens that mark traffic as bot-like even outside the named lists. */
const GENERIC_BOT_UA_PATTERN = /(bot|crawler|spider)/i;

export function loadBotSignatureConfig(filePath: string = DEFAULT_CONFIG_PATH): BotSignatureConfig {
  const raw = readFileSync(filePath, "utf8");
  return BotSignatureConfigSchema.parse(JSON.parse(raw));
}

// Read once at module load rather than per-request; callers that want a
// different list (tests, a hot-reloadable config) pass their own.
const defaultBotSignatureConfig = loadBotSignatureConfig();

/**
 * Classifies a request by User-Agent against the configured signature lists,
 * with a Web Bot Auth signature (Signature + Signature-Input headers) as a
 * stronger, independent signal: an ordinary browser never sends these, so
 * their presence alone is enough to call something a bot even when the UA
 * doesn't match a named crawler.
 *
 * `ip` is accepted for API stability (future work: reverse-DNS confirmation
 * for search crawlers, IP allowlists) but isn't used yet.
 */
export function classifyRequest(
  headers: Record<string, string>,
  _ip: string,
  config: BotSignatureConfig = defaultBotSignatureConfig,
): BotClassification {
  const userAgent = findHeader(headers, "user-agent") ?? "";
  const hasBotAuthSignature = Boolean(
    findHeader(headers, "signature") && findHeader(headers, "signature-input"),
  );

  if (matchesAny(userAgent, config.aiCrawlers)) {
    return "ai-crawler";
  }
  if (matchesAny(userAgent, config.searchCrawlers)) {
    return "search-crawler";
  }
  if (hasBotAuthSignature) {
    return "unknown-bot";
  }
  if (!userAgent || GENERIC_BOT_UA_PATTERN.test(userAgent)) {
    return "unknown-bot";
  }
  return "human";
}

function matchesAny(userAgent: string, entries: BotSignatureEntry[]): boolean {
  return entries.some((entry) => {
    try {
      return new RegExp(entry.userAgentPattern, "i").test(userAgent);
    } catch {
      return userAgent.toLowerCase().includes(entry.userAgentPattern.toLowerCase());
    }
  });
}
