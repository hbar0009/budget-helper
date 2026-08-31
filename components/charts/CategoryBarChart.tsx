"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ChartTooltip from "@/components/charts/ChartTooltip";
import { CHART, axisTick, money } from "@/components/charts/chartTheme";

/** Horizontal bars, one hue, biggest spend first. Single series — no legend. */
export default function CategoryBarChart({
  data,
  height = 260,
}: {
  /** `{ category, amount }` with `amount` a positive spend magnitude. */
  data: { category: string; amount: number }[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No expense categories in this period.
      </p>
    );
  }
  const rows = [...data].sort((a, b) => b.amount - a.amount).slice(0, 12);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={rows}
        margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
      >
        <CartesianGrid horizontal={false} stroke={CHART.grid} />
        <XAxis
          type="number"
          tickFormatter={(v) => money(v, true)}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={110}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
        />
        <Tooltip
          cursor={{ fill: CHART.grid, fillOpacity: 0.4 }}
          content={<ChartTooltip valueFormat={(n) => money(-n)} />}
        />
        <Bar dataKey="amount" name="Spend" fill={CHART.seq} radius={[0, 4, 4, 0]} maxBarSize={20}>
          <LabelList
            dataKey="amount"
            position="right"
            formatter={(v) => money(Number(v), true)}
            className="fill-muted-foreground"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
