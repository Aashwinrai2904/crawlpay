import { findHeader } from "@crawlpay/core";

/**
 * Minimal parsing/canonicalization for RFC 9421 (HTTP Message Signatures),
 * scoped to what Web Bot Auth actually uses. This is NOT a general RFC 8941
 * structured-field parser: it supports exactly one signature label per
 * header (no multi-signature dictionaries), and covered components limited
 * to the derived components below plus plain header fields (no structured
 * field parameters like `;req`, `sf`, `key`, `bs`).
 */

export interface ParsedSignatureInput {
  label: string;
  componentIds: string[];
  params: Record<string, string | number>;
  /** The literal text after `label=`, reused verbatim as @signature-params. */
  rawParams: string;
}

export class SignatureBaseError extends Error {}

/** The dictionary label is everything before the first top-level `=`. */
export function extractSignatureLabel(signatureInputHeader: string): string | null {
  const eqIdx = signatureInputHeader.indexOf("=");
  if (eqIdx <= 0) {
    return null;
  }
  return signatureInputHeader.slice(0, eqIdx).trim();
}

export function parseSignatureInput(
  signatureInputHeader: string,
  label: string,
): ParsedSignatureInput | null {
  const prefix = `${label}=`;
  if (!signatureInputHeader.trim().startsWith(prefix)) {
    return null;
  }
  const rawParams = signatureInputHeader.trim().slice(prefix.length).trim();

  const listMatch = rawParams.match(/^\(([^)]*)\)/);
  if (!listMatch) {
    return null;
  }
  const componentIds = [...(listMatch[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");

  const paramsStr = rawParams.slice(listMatch[0].length);
  const params: Record<string, string | number> = {};
  for (const part of paramsStr.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const rawValue = trimmed.slice(eqIdx + 1).trim();
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      params[key] = rawValue.slice(1, -1);
    } else if (/^-?\d+$/.test(rawValue)) {
      params[key] = Number(rawValue);
    } else {
      params[key] = rawValue;
    }
  }

  return { label, componentIds, params, rawParams };
}

/** Extracts the raw signature bytes for `label` from a Signature header (`label=:base64:`). */
export function parseSignatureBytes(signatureHeader: string, label: string): Buffer | null {
  const prefix = `${label}=:`;
  const startIdx = signatureHeader.indexOf(prefix);
  if (startIdx === -1) {
    return null;
  }
  const afterPrefix = signatureHeader.slice(startIdx + prefix.length);
  const endIdx = afterPrefix.indexOf(":");
  if (endIdx === -1) {
    return null;
  }
  const base64 = afterPrefix.slice(0, endIdx);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    return null;
  }
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

export interface SignatureBaseRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
}

/**
 * Builds the RFC 9421 "signature base" — the exact byte string the signer
 * signed — for the given covered components, ending with the
 * @signature-params line as the spec requires.
 */
export function buildSignatureBase(
  componentIds: string[],
  request: SignatureBaseRequest,
  rawParams: string,
): string {
  const targetUrl = new URL(request.url);
  const lines: string[] = [];

  for (const component of componentIds) {
    switch (component) {
      case "@method":
        lines.push(`"@method": ${request.method.toUpperCase()}`);
        break;
      case "@authority":
        lines.push(`"@authority": ${targetUrl.host.toLowerCase()}`);
        break;
      case "@target-uri":
        lines.push(`"@target-uri": ${request.url}`);
        break;
      case "@path":
        lines.push(`"@path": ${targetUrl.pathname}`);
        break;
      case "@scheme":
        lines.push(`"@scheme": ${targetUrl.protocol.replace(":", "")}`);
        break;
      case "@query":
        lines.push(`"@query": ${targetUrl.search}`);
        break;
      default: {
        const value = findHeader(request.headers, component);
        if (value === undefined) {
          throw new SignatureBaseError(`missing covered component: ${component}`);
        }
        lines.push(`"${component}": ${value.trim()}`);
        break;
      }
    }
  }

  lines.push(`"@signature-params": ${rawParams}`);
  return lines.join("\n");
}
