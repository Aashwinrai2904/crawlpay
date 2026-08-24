"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TopBot } from "../lib/stats";

export function TopBotsChart({ data }: { data: TopBot[] }) {
  if (data.length === 0) {
    return <p className="empty">No paid requests in the last 30 days yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="#262b38" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(value: number) => `$${value}`}
          tick={{ fill: "#9aa1b2", fontSize: 11 }}
          axisLine={{ stroke: "#262b38" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="botClassification"
          tick={{ fill: "#e7e9ee", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          contentStyle={{
            background: "#191d27",
            border: "1px solid #262b38",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#e7e9ee" }}
          formatter={(value: number, _name, item) => [
            `$${value.toFixed(2)} (${item.payload.count} paid requests)`,
            "Revenue",
          ]}
        />
        <Bar dataKey="revenue" fill="#34d399" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
