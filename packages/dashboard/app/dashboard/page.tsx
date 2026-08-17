import { requirePublisher } from "@/lib/auth";
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
    <div style={{ display: "grid", gap: "2rem", maxWidth: 900 }}>
      <section>
        <h1>Overview</h1>
        <p style={{ color: "#666" }}>
          Last 30 days across {sites.length} site{sites.length === 1 ? "" : "s"} —{" "}
          <strong>${totalRevenue.toFixed(4)}</strong> total revenue.
        </p>
      </section>

      <section>
        <h2>Revenue</h2>
        {chartData.length > 0 ? (
          <RevenueChart data={chartData} />
        ) : (
          <p style={{ color: "#666" }}>
            No transactions yet. Once your middleware is pushing transactions here,
            revenue shows up on this chart.
          </p>
        )}
      </section>

      <section>
        <h2>Revenue by traffic type</h2>
        {byClassification.size > 0 ? (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {[...byClassification.entries()]
                .sort(([, a], [, b]) => b - a)
                .map(([classification, usdc]) => (
                  <tr key={classification} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "0.4rem 0" }}>{classification}</td>
                    <td style={{ padding: "0.4rem 0", textAlign: "right" }}>
                      ${usdc.toFixed(4)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#666" }}>Nothing to break down yet.</p>
        )}
      </section>

      <section>
        <h2>Recent transactions</h2>
        {transactions.length > 0 ? (
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                <th style={{ padding: "0.4rem 0" }}>When</th>
                <th>Site</th>
                <th>URL</th>
                <th>Type</th>
                <th>Payer</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 20).map((tx) => (
                <tr key={tx.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.4rem 0" }}>{tx.occurredAt.toLocaleString()}</td>
                  <td>{tx.site.domain}</td>
                  <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {tx.url}
                  </td>
                  <td>{tx.botClassification}</td>
                  <td>{tx.payer}</td>
                  <td style={{ textAlign: "right" }}>${toUsdc(tx.amount).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#666" }}>No transactions recorded yet.</p>
        )}
      </section>

      <section>
        <h2>Your sites</h2>
        <ul>
          {sites.map((site) => (
            <li key={site.id}>
              {site.domain} —{" "}
              <a href={`/dashboard/sites/${site.id}/pricing`}>pricing</a> ·{" "}
              <a href={`/dashboard/sites/${site.id}/setup`}>setup</a>
            </li>
          ))}
        </ul>
        <form action={createSite} style={{ display: "flex", gap: "0.5rem", maxWidth: 400 }}>
          <input
            type="text"
            name="domain"
            placeholder="example.com"
            required
            style={{ flex: 1, padding: "0.4rem" }}
          />
          <button type="submit">Add site</button>
        </form>
      </section>
    </div>
  );
}
