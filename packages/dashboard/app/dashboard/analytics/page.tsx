import type { ReactNode } from "react";
import Link from "next/link";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { fetchSiteAnalytics } from "@/lib/analytics";
import { requirePublisher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STAT_TILES = [
  { key: "requests", label: "Requests" },
  { key: "allow", label: "Allowed" },
  { key: "paid", label: "Paid" },
  { key: "charge402", label: "402 issued" },
  { key: "block", label: "Blocked" },
] as const;

function Shell({ domain, children }: { domain?: string; children: ReactNode }) {
  return (
    <div className="stack" style={{ maxWidth: domain ? undefined : 720 }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>Bot traffic</h1>
        <p className="muted">{domain ? `Last 24 hours · ${domain}` : "Analytics"}</p>
      </div>
      {children}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { site?: string };
}) {
  const { publisher } = await requirePublisher();
  const sites = await prisma.site.findMany({
    where: { publisherId: publisher.id },
    orderBy: { createdAt: "asc" },
  });

  const selected = searchParams.site
    ? (sites.find((s) => s.id === searchParams.site) ?? sites[0])
    : sites[0];

  if (!selected) {
    return (
      <Shell>
        <p className="empty-state">
          Add a site first, then point its middleware at this dashboard to see which AI bots are
          hitting it.
        </p>
      </Shell>
    );
  }

  const analytics = await fetchSiteAnalytics(selected.id, 24);

  return (
    <Shell domain={selected.domain}>
      {sites.length > 1 ? (
        <nav className="app-nav" style={{ gap: "0.75rem" }}>
          {sites.map((site) => (
            <Link
              key={site.id}
              href={`/dashboard/analytics?site=${site.id}`}
              style={{ fontWeight: site.id === selected.id ? 600 : 400 }}
            >
              {site.domain}
            </Link>
          ))}
        </nav>
      ) : null}

      {analytics.degraded ? (
        <p className="empty-state">
          Can&apos;t reach this site&apos;s middleware right now. {analytics.degradedReason}
        </p>
      ) : (
        <>
          <section className="card">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "1rem",
              }}
            >
              {STAT_TILES.map((tile) => (
                <div key={tile.key}>
                  <div
                    style={{ fontSize: "1.6rem", fontWeight: 600, fontFamily: "var(--font-display)" }}
                  >
                    {analytics.totals[tile.key].toLocaleString()}
                  </div>
                  <div className="muted" style={{ fontSize: "0.8125rem" }}>
                    {tile.label}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <AnalyticsCharts data={analytics} />
        </>
      )}
    </Shell>
  );
}
