import { describe, expect, it } from "vitest";
import { computeEd25519Thumbprint } from "./jwks-thumbprint";

describe("computeEd25519Thumbprint", () => {
  it("matches the known RFC 7638 thumbprint for a fixed key", () => {
    // Ground-truthed against Node's own crypto.generateKeyPairSync("ed25519")
    // + createHash("sha256") — see commit history for the derivation script.
    const jwk = { kty: "OKP", crv: "Ed25519", x: "_m_7sSwN0juD1zHC0B1fZL0mTytNzzKGPEqI0c27Iuk" };
    expect(computeEd25519Thumbprint(jwk)).toBe("rsYYvAJ2J3G6POA7QiygSMaHBHhnOUCIo5_78ZhFFR4");
  });

  it("is deterministic for the same key", () => {
    const jwk = { kty: "OKP", crv: "Ed25519", x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };
    expect(computeEd25519Thumbprint(jwk)).toBe(computeEd25519Thumbprint(jwk));
  });

  it("differs for different keys", () => {
    const a = computeEd25519Thumbprint({ kty: "OKP", crv: "Ed25519", x: "AAAA" });
    const b = computeEd25519Thumbprint({ kty: "OKP", crv: "Ed25519", x: "BBBB" });
    expect(a).not.toBe(b);
  });
});
