import { prisma } from "./prisma";
import { atomicUnitsToDollars } from "./site-config";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

export interface RevenuePoint {
  date: string; // YYYY-MM-DD
  revenue: number;
}

export interface TopBot {
  botClassification: string;
  revenue: number;
  count: number;
}

export interface RecentTransaction {
  id: string;
  url: string;
  botClassification: string;
  amountDollars: number;
  payer: string;
  occurredAt: Date;
}

export interface SiteOverview {
  revenueThisWeek: number;
  revenueThisMonth: number;
  revenueSeries: RevenuePoint[];
  topBots: TopBot[];
  recentTransactions: RecentTransaction[];
}

/** Everything the /dashboard overview page needs for one site, in one round trip through Prisma. */
export async function loadSiteOverview(siteId: string): Promise<SiteOverview> {
  const since = daysAgo(30);
  const weekStart = daysAgo(7);
  const monthStart = daysAgo(30);

  const [recent, transactions] = await Promise.all([
    prisma.transaction.findMany({
      where: { siteId },
      orderBy: { occurredAt: "desc" },
      take: 25,
    }),
    prisma.transaction.findMany({
      where: { siteId, occurredAt: { gte: since } },
      select: { amount: true, occurredAt: true, botClassification: true },
    }),
  ]);

  let revenueThisWeek = 0;
  let revenueThisMonth = 0;
  const byDay = new Map<string, number>();
  const byBot = new Map<string, { revenue: number; count: number }>();

  for (const tx of transactions) {
    const dollars = atomicUnitsToDollars(tx.amount);
    if (tx.occurredAt >= monthStart) {
      revenueThisMonth += dollars;
    }
    if (tx.occurredAt >= weekStart) {
      revenueThisWeek += dollars;
    }

    const dayKey = startOfDay(tx.occurredAt).toISOString().slice(0, 10);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + dollars);

    const bot = byBot.get(tx.botClassification) ?? { revenue: 0, count: 0 };
    bot.revenue += dollars;
    bot.count += 1;
    byBot.set(tx.botClassification, bot);
  }

  const revenueSeries: RevenuePoint[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const day = daysAgo(i);
    const key = day.toISOString().slice(0, 10);
    revenueSeries.push({ date: key, revenue: Math.round((byDay.get(key) ?? 0) * 100) / 100 });
  }

  const topBots = [...byBot.entries()]
    .map(([botClassification, v]) => ({ botClassification, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    revenueThisWeek: Math.round(revenueThisWeek * 100) / 100,
    revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
    revenueSeries,
    topBots,
    recentTransactions: recent.map((tx) => ({
      id: tx.id,
      url: tx.url,
      botClassification: tx.botClassification,
      amountDollars: atomicUnitsToDollars(tx.amount),
      payer: tx.payer,
      occurredAt: tx.occurredAt,
    })),
  };
}
