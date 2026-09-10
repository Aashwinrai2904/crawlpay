"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RequestAnalytics } from "@/lib/analytics";

const OUTCOMES = [
  { key: "allow", label: "Allowed", fill: "#4f6bed" },
  { key: "paid", label: "Paid", fill: "#1f9d55" },
  { key: "charge402", label: "402 issued", fill: "#e0a800" },
  { key: "block", label: "Blocked", fill: "#d64545" },
] as const;

const AXIS = "#6b7078";
const GRID = "#e9eaee";

const tooltipStyle = {
  border: `1px solid ${GRID}`,
  borderRadius: 12,
  boxShadow: "0 8px 40px rgba(16,18,24,.08)",
  fontSize: 13,
};

function shortResource(resource: string): string {
  if (resource.length <= 28) return resource;
  return `${resource.slice(0, 13)}…${resource.slice(-13)}`;
}

function hourLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
}

function StackedBars() {
  return OUTCOMES.map((o) => (
    <Bar key={o.key} dataKey={o.key} name={o.label} stackId="outcome" fill={o.fill} maxBarSize={44} />
  ));
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>{title}</h2>
      {children}
    </section>
  );
}

export function AnalyticsCharts({ data }: { data: RequestAnalytics }) {
  const byBot = data.byBot;
  const byHour = useMemo(
    () => data.byHour.map((h) => ({ ...h, label: hourLabel(h.hour) })),
    [data.byHour],
  );
  const topPages = useMemo(
    () => data.byPage.slice(0, 12).map((p) => ({ ...p, label: shortResource(p.resource) })),
    [data.byPage],
  );

  const heatmap = useMemo(() => {
    const bots = byBot.map((b) => b.botName);
    const pages = data.byPage.slice(0, 10).map((p) => p.resource);
    const lookup = new Map(
      data.heatmap.map((c) => [JSON.stringify([c.botName, c.resource]), c.requests]),
    );
    const max = data.heatmap.reduce((m, c) => Math.max(m, c.requests), 0) || 1;
    return { bots, pages, lookup, max };
  }, [byBot, data.byPage, data.heatmap]);

  if (data.totals.requests === 0) {
    return (
      <p className="empty-state">
        No requests classified in this window yet. Once traffic flows through the middleware, it
        shows up here.
      </p>
    );
  }

  return (
    <div className="stack">
      <ChartCard title="Requests by bot">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byBot}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="botName"
              fontSize={12}
              stroke={AXIS}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={60}
            />
            <YAxis fontSize={12} stroke={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: "#f4f5f7" }} contentStyle={tooltipStyle} />
            <Legend />
            {StackedBars()}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Requests by hour (UTC)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={byHour}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              fontSize={12}
              stroke={AXIS}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis fontSize={12} stroke={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: "#f4f5f7" }} contentStyle={tooltipStyle} />
            <Legend />
            {StackedBars()}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Top pages targeted">
        <ResponsiveContainer width="100%" height={Math.max(200, topPages.length * 34)}>
          <BarChart data={topPages} layout="vertical">
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" fontSize={12} stroke={AXIS} tickLine={false} axisLine={{ stroke: GRID }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={160}
              fontSize={12}
              stroke={AXIS}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip cursor={{ fill: "#f4f5f7" }} contentStyle={tooltipStyle} />
            <Legend />
            {StackedBars()}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Which bots target which pages">
        {heatmap.bots.length === 0 || heatmap.pages.length === 0 ? (
          <p className="empty-state">Not enough data for a heatmap yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bot / page</th>
                  {heatmap.pages.map((page) => (
                    <th key={page} title={page} style={{ fontWeight: 500 }}>
                      {shortResource(page)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.bots.map((bot) => (
                  <tr key={bot}>
                    <td style={{ fontWeight: 500 }}>{bot}</td>
                    {heatmap.pages.map((page) => {
                      const count = heatmap.lookup.get(JSON.stringify([bot, page])) ?? 0;
                      const intensity = count / heatmap.max;
                      return (
                        <td
                          key={page}
                          style={{
                            textAlign: "center",
                            background:
                              count === 0 ? undefined : `rgba(79, 107, 237, ${0.12 + intensity * 0.7})`,
                            color: intensity > 0.55 ? "#fff" : undefined,
                          }}
                        >
                          {count || ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
