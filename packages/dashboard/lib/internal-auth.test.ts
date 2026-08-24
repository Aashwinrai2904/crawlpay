import { describe, expect, it } from "vitest";
import { authorizeDeployKey, DEPLOY_KEY_HEADER, type HeaderSource } from "./internal-auth";

function requestWithHeader(value: string | null): HeaderSource {
  return {
    headers: {
      get: (name: string) => (name === DEPLOY_KEY_HEADER ? value : null),
    },
  };
}

describe("authorizeDeployKey", () => {
  it("accepts a matching deploy key", () => {
    expect(authorizeDeployKey(requestWithHeader("top-secret"), "top-secret")).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(authorizeDeployKey(requestWithHeader(null), "top-secret")).toBe(false);
  });

  it("rejects a mismatched key", () => {
    expect(authorizeDeployKey(requestWithHeader("wrong"), "top-secret")).toBe(false);
  });

  it("rejects a key of different length without throwing", () => {
    expect(authorizeDeployKey(requestWithHeader("short"), "a-much-longer-secret")).toBe(false);
  });
});
