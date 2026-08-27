"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RevenueChartPoint {
  date: string;
  usdc: number;
}

export function RevenueChart({ data }: { data: RevenueChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke="#e9eaee" />
        <XAxis
          dataKey="date"
          fontSize={12}
          stroke="#6b7078"
          tickLine={false}
          axisLine={{ stroke: "#e9eaee" }}
        />
        <YAxis
          fontSize={12}
          stroke="#6b7078"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <Tooltip
          cursor={{ fill: "#f4f5f7" }}
          formatter={(v: number) => [`$${v.toFixed(4)}`, "Revenue"]}
          contentStyle={{
            border: "1px solid #e9eaee",
            borderRadius: 12,
            boxShadow: "0 8px 40px rgba(16,18,24,.08)",
            fontSize: 13,
          }}
        />
        <Bar dataKey="usdc" fill="#4f6bed" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
