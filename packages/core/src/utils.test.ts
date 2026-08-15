import { describe, expect, it } from "vitest";
import { base64UrlDecode, base64UrlEncode } from "./utils";

describe("base64Url round trip", () => {
  it("encodes and decodes back to the original string", () => {
    const original = "crawlpay x402 payload";
    expect(base64UrlDecode(base64UrlEncode(original))).toBe(original);
  });
});
