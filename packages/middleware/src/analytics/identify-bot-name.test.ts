import { describe, expect, it } from "vitest";
import { identifyBotName } from "../bot-detection";
import type { BotSignatureConfig } from "../bot-detection";

const config: BotSignatureConfig = {
  aiCrawlers: [
    { name: "GPTBot", userAgentPattern: "GPTBot" },
    { name: "ClaudeBot", userAgentPattern: "ClaudeBot|Claude-Web" },
  ],
  searchCrawlers: [{ name: "Googlebot", userAgentPattern: "Googlebot" }],
};

describe("identifyBotName", () => {
  it("returns the matched AI crawler's name", () => {
    expect(identifyBotName({ "user-agent": "Mozilla/5.0 compatible; GPTBot/1.2" }, config)).toBe(
      "GPTBot",
    );
    expect(identifyBotName({ "user-agent": "ClaudeBot/1.0" }, config)).toBe("ClaudeBot");
  });

  it("returns the matched search crawler's name", () => {
    expect(identifyBotName({ "user-agent": "... Googlebot/2.1 ..." }, config)).toBe("Googlebot");
  });

  it("returns 'human' for an ordinary browser UA", () => {
    expect(
      identifyBotName(
        { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/128 Safari/537.36" },
        config,
      ),
    ).toBe("human");
  });

  it("returns 'unknown-bot' for an unnamed crawler, a Web Bot Auth signature, or no UA", () => {
    expect(identifyBotName({ "user-agent": "SomeRandomCrawler/9" }, config)).toBe("unknown-bot");
    expect(
      identifyBotName(
        { "user-agent": "Mozilla/5.0", signature: "sig=:abc:", "signature-input": "sig=(...)" },
        config,
      ),
    ).toBe("unknown-bot");
    expect(identifyBotName({}, config)).toBe("unknown-bot");
  });
});
