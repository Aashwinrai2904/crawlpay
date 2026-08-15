import { describe, expect, it } from "vitest";
import { normalizeCacheKey } from "./key";

describe("normalizeCacheKey", () => {
  it("keeps host and path with no query", () => {
    expect(normalizeCacheKey("https://publisher.example/premium-article")).toBe(
      "publisher.example/premium-article",
    );
  });

  it("strips utm_* and other tracking params", () => {
    const url =
      "https://publisher.example/article?utm_source=x&utm_campaign=y&fbclid=abc&gclid=def&msclkid=ghi&ref=newsletter";
    expect(normalizeCacheKey(url)).toBe("publisher.example/article");
  });

  it("strips mc_cid and mc_eid", () => {
    expect(normalizeCacheKey("https://publisher.example/article?mc_cid=1&mc_eid=2")).toBe(
      "publisher.example/article",
    );
  });

  it("keeps non-tracking query params, sorted", () => {
    const a = normalizeCacheKey("https://publisher.example/search?q=cats&page=2");
    const b = normalizeCacheKey("https://publisher.example/search?page=2&q=cats");
    expect(a).toBe("publisher.example/search?page=2&q=cats");
    expect(a).toBe(b);
  });

  it("mixes tracking and non-tracking params correctly", () => {
    const url = "https://publisher.example/article?id=42&utm_source=newsletter";
    expect(normalizeCacheKey(url)).toBe("publisher.example/article?id=42");
  });

  it("lowercases the host but not the path", () => {
    expect(normalizeCacheKey("https://Publisher.Example/Premium-Article")).toBe(
      "publisher.example/Premium-Article",
    );
  });

  it("treats different hosts as different keys", () => {
    const a = normalizeCacheKey("https://site-a.example/page");
    const b = normalizeCacheKey("https://site-b.example/page");
    expect(a).not.toBe(b);
  });
});
