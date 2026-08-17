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
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
        <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, "Revenue"]} />
        <Bar dataKey="usdc" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
