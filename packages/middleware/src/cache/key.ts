const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^ref$/i,
];

/**
 * Normalizes a URL into a cache key: host + path + sorted, tracking-param-
 * stripped query string. Two URLs differing only in utm_* etc. collapse to
 * the same key so a paid/cached response is reused instead of missing.
 */
export function normalizeCacheKey(url: string): string {
  const parsed = new URL(url);

  const keptParams: Array<[string, string]> = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key))) {
      keptParams.push([key, value]);
    }
  }
  keptParams.sort(([a], [b]) => a.localeCompare(b));

  const query = keptParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const base = `${parsed.host.toLowerCase()}${parsed.pathname}`;
  return query ? `${base}?${query}` : base;
}
