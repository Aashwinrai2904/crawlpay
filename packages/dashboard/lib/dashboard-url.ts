import { headers } from "next/headers";

/** Best-effort public base URL for this dashboard deployment, for the setup page's copy-paste env vars. */
export function getDashboardBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }
  const requestHeaders = headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
