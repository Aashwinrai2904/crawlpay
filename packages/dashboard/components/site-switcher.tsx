"use client";

import { useRouter } from "next/navigation";

export function SiteSwitcher({
  sites,
  activeSiteId,
}: {
  sites: { id: string; domain: string }[];
  activeSiteId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={activeSiteId}
      onChange={(event) => router.push(`/dashboard?site=${event.target.value}`)}
    >
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.domain}
        </option>
      ))}
    </select>
  );
}
