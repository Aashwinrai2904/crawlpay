import { generateKeyPairSync, sign as signEd25519 } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { InMemoryJwksCache } from "./jwks-cache";
import { computeEd25519Thumbprint } from "./jwks-thumbprint";
import { buildSignatureBase } from "./signature-base";
import type { BotAuthVerifyRequest } from "./types";
import { verifyBotAuthSignature } from "./verify-bot-auth";

interface SignedFixture {
  request: BotAuthVerifyRequest;
  jwk: { kty: string; crv: string; x: string };
  keyId: string;
}

const JWKS_URL = "https://bot.example/.well-known/http-message-signatures-directory";
const RESOURCE_URL = "https://publisher.example/premium-article";

function buildSignedRequest(
  overrides: {
    tamperSignature?: boolean;
    created?: number;
    componentIds?: string[];
    alg?: string;
  } = {},
): SignedFixture {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { kty: string; crv: string; x: string };
  const keyId = computeEd25519Thumbprint(jwk);

  const method = "GET";
  const created = overrides.created ?? Math.floor(Date.now() / 1000);
  const componentIds = overrides.componentIds ?? ["@method", "@authority", "signature-agent"];
  const alg = overrides.alg ?? "ed25519";
  const rawParams = `(${componentIds.map((c) => `"${c}"`).join(" ")});created=${created};keyid="${keyId}";alg="${alg}"`;

  const headers: Record<string, string> = { "signature-agent": `"${JWKS_URL}"` };

  const base = buildSignatureBase(componentIds, { method, url: RESOURCE_URL, headers }, rawParams);
  const signature = signEd25519(null, Buffer.from(base, "utf8"), privateKey);
  if (overrides.tamperSignature) {
    signature.writeUInt8(signature.readUInt8(0) ^ 0xff, 0);
  }

  headers["signature-input"] = `sig1=${rawParams}`;
  headers.signature = `sig1=:${signature.toString("base64")}:`;

  return { request: { method, url: RESOURCE_URL, headers }, jwk, keyId };
}

function fetchServingJwks(jwk: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }),
  ) as unknown as typeof fetch;
}

describe("verifyBotAuthSignature", () => {
  it("verifies a validly signed request against the signer's published key", async () => {
    const { request, jwk, keyId } = buildSignedRequest();

    const result = await verifyBotAuthSignature(request, { fetchImpl: fetchServingJwks(jwk) });

    expect(result).toEqual({ verified: true, keyId });
  });

  it("rejects a forged signature", async () => {
    const { request, jwk, keyId } = buildSignedRequest({ tamperSignature: true });

    const result = await verifyBotAuthSignature(request, { fetchImpl: fetchServingJwks(jwk) });

    expect(result).toEqual({ verified: false, keyId, reason: "signature does not match" });
  });

  it("rejects when Signature/Signature-Input headers are absent", async () => {
    const result = await verifyBotAuthSignature(
      { method: "GET", url: RESOURCE_URL, headers: {} },
      { fetchImpl: fetchServingJwks({}) },
    );

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/missing Signature/);
  });

  it("rejects a signature older than the allowed window", async () => {
    const { request, jwk } = buildSignedRequest({ created: Math.floor(Date.now() / 1000) - 1000 });

    const result = await verifyBotAuthSignature(request, { fetchImpl: fetchServingJwks(jwk) });

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/too old/);
  });

  it("rejects an unsupported algorithm", async () => {
    const { request, jwk } = buildSignedRequest({ alg: "rsa-pss-sha512" });

    const result = await verifyBotAuthSignature(request, { fetchImpl: fetchServingJwks(jwk) });

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/unsupported or missing algorithm/);
  });

  it("rejects when signature-agent isn't a covered component", async () => {
    const { request, jwk } = buildSignedRequest({ componentIds: ["@method", "@authority"] });

    const result = await verifyBotAuthSignature(request, { fetchImpl: fetchServingJwks(jwk) });

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/signature-agent must be a covered component/);
  });

  it("rejects when the claimed key isn't in the signer's JWKS directory", async () => {
    const { request } = buildSignedRequest();
    const { publicKey: otherKey } = generateKeyPairSync("ed25519");
    const unrelatedJwk = otherKey.export({ format: "jwk" });

    const result = await verifyBotAuthSignature(request, {
      fetchImpl: fetchServingJwks(unrelatedJwk),
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/public key not found/);
  });

  it("rejects a non-https signature-agent", async () => {
    const { request, jwk } = buildSignedRequest();
    request.headers["signature-agent"] =
      '"http://bot.example/.well-known/http-message-signatures-directory"';

    const result = await verifyBotAuthSignature(request, { fetchImpl: fetchServingJwks(jwk) });

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/https URL/);
  });

  it("caches the fetched key and doesn't re-fetch on the next verification", async () => {
    const { request, jwk } = buildSignedRequest();
    const fetchImpl = fetchServingJwks(jwk);
    const jwksCache = new InMemoryJwksCache();

    await verifyBotAuthSignature(request, { fetchImpl, jwksCache });
    await verifyBotAuthSignature(request, { fetchImpl, jwksCache });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
