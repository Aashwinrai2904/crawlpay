import Link from "next/link";
import { RevenueChart } from "../../components/revenue-chart";
import { SiteSwitcher } from "../../components/site-switcher";
import { TopBotsChart } from "../../components/top-bots-chart";
import { requireCurrentPublisher } from "../../lib/current-publisher";
import { createSite } from "../../lib/actions/sites";
import { loadSiteOverview } from "../../lib/stats";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: { site?: string };
}) {
  const publisher = await requireCurrentPublisher();

  if (publisher.sites.length === 0) {
    return (
      <main className="page stack">
        <div>
          <h1>Welcome to CrawlPay</h1>
          <p className="text-muted">
            Add your first site to start charging AI crawlers per request.
          </p>
        </div>
        <div className="card">
          <AddSiteForm />
        </div>
      </main>
    );
  }

  const activeSite = publisher.sites.find((s) => s.id === searchParams.site) ?? publisher.sites[0]!;
  const overview = await loadSiteOverview(activeSite.id);
  const topBot = overview.topBots[0];

  return (
    <main className="page stack">
      <div className="row-between">
        <div>
          <h1>Overview</h1>
          <p className="text-muted">{activeSite.domain}</p>
        </div>
        <div className="row">
          {publisher.sites.length > 1 && (
            <SiteSwitcher
              sites={publisher.sites.map((s) => ({ id: s.id, domain: s.domain }))}
              activeSiteId={activeSite.id}
            />
          )}
          <Link href={`/dashboard/sites/${activeSite.id}/pricing`} className="btn">
            Pricing
          </Link>
          <Link href={`/dashboard/sites/${activeSite.id}/setup`} className="btn">
            Setup
          </Link>
        </div>
      </div>

      <div className="grid grid-stats">
        <div className="card">
          <div className="stat-label">Revenue this week</div>
          <div className="stat-value">${overview.revenueThisWeek.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Revenue this month</div>
          <div className="stat-value">${overview.revenueThisMonth.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Top-paying bot</div>
          <div className="stat-value">{topBot?.botClassification ?? "—"}</div>
          <div className="stat-sub">
            {topBot
              ? `$${topBot.revenue.toFixed(2)} · ${topBot.count} requests`
              : "No paid requests yet"}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Cache hit rate</div>
          <div className="stat-value">—</div>
          <div className="stat-sub">
            Reported by the middleware&apos;s <span className="mono">/stats</span> endpoint; not yet
            wired into the dashboard&apos;s data model.
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Revenue, last 30 days</h2>
        <RevenueChart data={overview.revenueSeries} />
      </div>

      <div className="card">
        <h2>Top-paying bots</h2>
        <TopBotsChart data={overview.topBots} />
      </div>

      <div className="card">
        <h2>Recent transactions</h2>
        {overview.recentTransactions.length === 0 ? (
          <p className="empty">
            No transactions yet. Once the middleware is set up (see the Setup page), paid requests
            will show up here.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>URL</th>
                  <th>Bot</th>
                  <th>Payer</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.occurredAt.toLocaleString()}</td>
                    <td
                      className="mono"
                      style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {tx.url}
                    </td>
                    <td>
                      <span
                        className={`badge ${tx.botClassification === "ai-crawler" ? "badge-charge" : "badge-allow"}`}
                      >
                        {tx.botClassification}
                      </span>
                    </td>
                    <td className="mono">{tx.payer}</td>
                    <td>${tx.amountDollars.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card stack">
        <h2>Sites</h2>
        <div className="stack">
          {publisher.sites.map((s) => (
            <div key={s.id} className="row-between">
              <span>{s.domain}</span>
              <div className="row">
                <Link href={`/dashboard/sites/${s.id}/pricing`} className="btn">
                  Pricing
                </Link>
                <Link href={`/dashboard/sites/${s.id}/setup`} className="btn">
                  Setup
                </Link>
              </div>
            </div>
          ))}
        </div>
        <details>
          <summary>Add another site</summary>
          <AddSiteForm />
        </details>
      </div>
    </main>
  );
}

function AddSiteForm() {
  return (
    <form action={createSite} className="row" style={{ marginTop: 12 }}>
      <input type="text" name="domain" placeholder="example.com" required style={{ flex: 1 }} />
      <button type="submit" className="btn-primary">
        Add site
      </button>
    </form>
  );
}
