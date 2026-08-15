import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPolicyConfig, resolvePolicy } from "./policy";
import type { PolicyConfig } from "./types";

const config: PolicyConfig = {
  human: "allow",
  "search-crawler": "allow",
  "ai-crawler": "charge",
  "unknown-bot": "block",
};

describe("resolvePolicy", () => {
  it("looks up the configured action for each classification", () => {
    expect(resolvePolicy("human", config)).toBe("allow");
    expect(resolvePolicy("search-crawler", config)).toBe("allow");
    expect(resolvePolicy("ai-crawler", config)).toBe("charge");
    expect(resolvePolicy("unknown-bot", config)).toBe("block");
  });
});

describe("loadPolicyConfig", () => {
  it("loads the shipped default JSON policy", () => {
    const loaded = loadPolicyConfig(join(__dirname, "..", "..", "config", "bot-policy.json"));
    expect(loaded).toEqual(config);
  });

  it("loads an equivalent YAML policy", () => {
    const loaded = loadPolicyConfig(join(__dirname, "__fixtures__", "bot-policy.yaml"));
    expect(loaded).toEqual(config);
  });

  it("rejects a config missing a required classification", () => {
    expect(() =>
      loadPolicyConfig(join(__dirname, "__fixtures__", "invalid-bot-policy.json")),
    ).toThrow();
  });
});
