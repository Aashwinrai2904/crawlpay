import type { FastifyReply, FastifyRequest } from "fastify";
import type { CachedResponse, OriginResponse } from "./cache";

/** Headers that don't make sense to replay verbatim once the body has already been decoded/re-served. */
const SKIPPED_RESPONSE_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
]);

export function normalizeHeaders(headers: FastifyRequest["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.join(", ");
    }
  }
  return result;
}

/** The resource identity as the caller actually requested it — used for cache keys and PaymentRequirements.resource. */
export function publicUrlFor(request: FastifyRequest): string {
  const host = request.headers.host ?? request.hostname;
  return `${request.protocol}://${host}${request.url}`;
}

export async function fetchFromOrigin(
  fetchImpl: typeof fetch,
  originBaseUrl: string,
  requestPath: string,
): Promise<OriginResponse> {
  const originUrl = new URL(requestPath, originBaseUrl).toString();
  const response = await fetchImpl(originUrl);
  const body = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { body, headers, status: response.status };
}

export function respondWithOrigin(reply: FastifyReply, result: CachedResponse): string {
  for (const [key, value] of Object.entries(result.headers)) {
    if (!SKIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      reply.header(key, value);
    }
  }
  reply.code(result.status);
  return result.body;
}
