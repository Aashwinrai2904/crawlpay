import { requirePublisher } from "@/lib/auth";
import { classificationPillClass } from "@/lib/classification-pill";
import { prisma } from "@/lib/prisma";
import { RevenueChart, type RevenueChartPoint } from "@/components/RevenueChart";
import { createSite } from "./actions";

/** Atomic-unit -> display conversion assumes USDC's 6 decimals, the only
 * asset this project uses anywhere yet (see createSite's default). */
function toUsdc(amount: string): number {
  const n = Number(amount);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

export default async function DashboardOverviewPage() {
  const { publisher } = await requirePublisher();

  const sites = await prisma.site.findMany({
    where: { publisherId: publisher.id },
    orderBy: { createdAt: "asc" },
  });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const transactions = await prisma.transaction.findMany({
    where: { site: { publisherId: publisher.id }, occurredAt: { gte: since } },
    orderBy: { occurredAt: "desc" },
    take: 500,
    include: { site: true },
  });

  const byDay = new Map<string, number>();
  const byClassification = new Map<string, number>();
  for (const tx of transactions) {
    const day = tx.occurredAt.toISOString().slice(0, 10);
    const usdc = toUsdc(tx.amount);
    byDay.set(day, (byDay.get(day) ?? 0) + usdc);
    byClassification.set(
      tx.botClassification,
      (byClassification.get(tx.botClassification) ?? 0) + usdc,
    );
  }
  const chartData: RevenueChartPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, usdc]) => ({ date, usdc }));

  const totalRevenue = transactions.reduce((sum, tx) => sum + toUsdc(tx.amount), 0);

  return (
    <div className="stack">
      <section>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Overview</h1>
        <p className="muted">
          Last 30 days across {sites.length} site{sites.length === 1 ? "" : "s"} —{" "}
          <strong style={{ color: "var(--ink)" }}>${totalRevenue.toFixed(4)}</strong> total revenue.
        </p>
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Revenue</h2>
        {chartData.length > 0 ? (
          <RevenueChart data={chartData} />
        ) : (
          <p className="empty-state">
            No transactions yet. Once your middleware is pushing transactions here, revenue shows
            up on this chart.
          </p>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Revenue by traffic type</h2>
        {byClassification.size > 0 ? (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {[...byClassification.entries()]
              .sort(([, a], [, b]) => b - a)
              .map(([classification, usdc]) => (
                <div key={classification} className="field-row">
                  <span className={`pill ${classificationPillClass(classification)}`}>
                    {classification}
                  </span>
                  <span style={{ fontWeight: 600, fontFamily: "var(--font-display)" }}>
                    ${usdc.toFixed(4)}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <p className="empty-state">Nothing to break down yet.</p>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Recent transactions</h2>
        {transactions.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Site</th>
                  <th>URL</th>
                  <th>Type</th>
                  <th>Payer</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 20).map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.occurredAt.toLocaleString()}</td>
                    <td>{tx.site.domain}</td>
                    <td
                      style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {tx.url}
                    </td>
                    <td>
                      <span className={`pill ${classificationPillClass(tx.botClassification)}`}>
                        {tx.botClassification}
                      </span>
                    </td>
                    <td
                      style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {tx.payer}
                    </td>
                    <td style={{ textAlign: "right" }}>${toUsdc(tx.amount).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No transactions recorded yet.</p>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Your sites</h2>
        {sites.length > 0 ? (
          <ul style={{ display: "grid", gap: "0.5rem", marginBottom: "1.25rem" }}>
            {sites.map((site) => (
              <li key={site.id} className="field-row" style={{ padding: "0.5rem 0" }}>
                <span style={{ fontWeight: 500 }}>{site.domain}</span>
                <span style={{ display: "flex", gap: "1rem", fontSize: "0.8125rem" }}>
                  <a href={`/dashboard/sites/${site.id}/pricing`}>pricing</a>
                  <a href={`/dashboard/sites/${site.id}/setup`}>setup</a>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={createSite} className="form-inline" style={{ maxWidth: 420 }}>
          <input type="text" name="domain" placeholder="example.com" required style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary">
            Add site
          </button>
        </form>
      </section>
    </div>
  );
}
