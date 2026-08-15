import { describe, expect, it } from "vitest";
import {
  buildSignatureBase,
  extractSignatureLabel,
  parseSignatureBytes,
  parseSignatureInput,
} from "./signature-base";

describe("extractSignatureLabel", () => {
  it("reads the label before the first =", () => {
    expect(extractSignatureLabel('sig1=("@method")')).toBe("sig1");
  });

  it("returns null when there's no =", () => {
    expect(extractSignatureLabel("garbage")).toBeNull();
  });
});

describe("parseSignatureInput", () => {
  it("parses components and typed params", () => {
    const header =
      'sig1=("@method" "@authority" "signature-agent");created=1700000000;keyid="abc123";alg="ed25519"';
    const parsed = parseSignatureInput(header, "sig1");

    expect(parsed).not.toBeNull();
    expect(parsed?.componentIds).toEqual(["@method", "@authority", "signature-agent"]);
    expect(parsed?.params).toEqual({ created: 1700000000, keyid: "abc123", alg: "ed25519" });
    expect(parsed?.rawParams).toBe(
      '("@method" "@authority" "signature-agent");created=1700000000;keyid="abc123";alg="ed25519"',
    );
  });

  it("returns null when the label doesn't match", () => {
    expect(parseSignatureInput('sig1=("@method")', "sig2")).toBeNull();
  });

  it("returns null when the component list is malformed", () => {
    expect(parseSignatureInput('sig1=["@method"]', "sig1")).toBeNull();
  });
});

describe("parseSignatureBytes", () => {
  it("decodes the base64 byte sequence for the given label", () => {
    const bytes = parseSignatureBytes("sig1=:AQID:", "sig1");
    expect(bytes).toEqual(Buffer.from([1, 2, 3]));
  });

  it("returns null when the label is absent", () => {
    expect(parseSignatureBytes("sig1=:AQID:", "sig2")).toBeNull();
  });

  it("returns null when the byte sequence isn't closed", () => {
    expect(parseSignatureBytes("sig1=:AQID", "sig1")).toBeNull();
  });
});

describe("buildSignatureBase", () => {
  it("matches the RFC 9421 canonical form for a simple @method-only example", () => {
    const rawParams = '("@method");created=1700000000;keyid="abc123";alg="ed25519"';
    const base = buildSignatureBase(
      ["@method"],
      { method: "get", url: "https://example.com/x", headers: {} },
      rawParams,
    );

    expect(base).toBe(
      '"@method": GET\n"@signature-params": ("@method");created=1700000000;keyid="abc123";alg="ed25519"',
    );
  });

  it("covers derived components and header fields together", () => {
    const rawParams = '("@method" "@authority" "@path" "signature-agent");alg="ed25519"';
    const base = buildSignatureBase(
      ["@method", "@authority", "@path", "signature-agent"],
      {
        method: "GET",
        url: "https://publisher.example/premium-article",
        headers: {
          "Signature-Agent": '"https://bot.example/.well-known/http-message-signatures-directory"',
        },
      },
      rawParams,
    );

    expect(base).toBe(
      [
        '"@method": GET',
        '"@authority": publisher.example',
        '"@path": /premium-article',
        '"signature-agent": "https://bot.example/.well-known/http-message-signatures-directory"',
        `"@signature-params": ${rawParams}`,
      ].join("\n"),
    );
  });

  it("throws when a covered header is missing from the request", () => {
    expect(() =>
      buildSignatureBase(
        ["signature-agent"],
        { method: "GET", url: "https://x.example/", headers: {} },
        "()",
      ),
    ).toThrow(/missing covered component/);
  });
});
