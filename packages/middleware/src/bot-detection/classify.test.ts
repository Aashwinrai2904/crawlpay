import { describe, expect, it } from "vitest";
import { classifyRequest } from "./classify";
import type { BotSignatureConfig } from "./types";

const config: BotSignatureConfig = {
  aiCrawlers: [
    { name: "GPTBot", userAgentPattern: "GPTBot" },
    { name: "ClaudeBot", userAgentPattern: "ClaudeBot" },
  ],
  searchCrawlers: [
    { name: "Googlebot", userAgentPattern: "Googlebot" },
    { name: "Bingbot", userAgentPattern: "bingbot" },
  ],
};

describe("classifyRequest", () => {
  it("classifies an ordinary browser as human", () => {
    const headers = {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
    };
    expect(classifyRequest(headers, "203.0.113.1", config)).toBe("human");
  });

  it("classifies Googlebot as a search crawler", () => {
    const headers = {
      "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    };
    expect(classifyRequest(headers, "66.249.66.1", config)).toBe("search-crawler");
  });

  it("classifies GPTBot as an ai crawler", () => {
    const headers = {
      "user-agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2",
    };
    expect(classifyRequest(headers, "20.0.0.1", config)).toBe("ai-crawler");
  });

  it("classifies an unnamed bot-like UA as unknown-bot", () => {
    const headers = { "user-agent": "SomeRandomCrawler/1.0" };
    expect(classifyRequest(headers, "198.51.100.1", config)).toBe("unknown-bot");
  });

  it("classifies a missing UA as unknown-bot", () => {
    expect(classifyRequest({}, "198.51.100.1", config)).toBe("unknown-bot");
  });

  it("classifies a signed request with a human-looking UA as unknown-bot", () => {
    const headers = {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      signature: "sig1=:AAAA:",
      "signature-input": 'sig1=("@method");alg="ed25519";keyid="x"',
    };
    expect(classifyRequest(headers, "198.51.100.1", config)).toBe("unknown-bot");
  });

  it("prefers a named ai-crawler match over generic bot heuristics", () => {
    const headers = { "user-agent": "ClaudeBot/1.0 (+https://anthropic.com/claudebot)" };
    expect(classifyRequest(headers, "1.2.3.4", config)).toBe("ai-crawler");
  });
});
