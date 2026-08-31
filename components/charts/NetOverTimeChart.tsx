"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ChartTooltip from "@/components/charts/ChartTooltip";
import {
  CHART,
  axisTick,
  money,
  monthLong,
  monthShort,
} from "@/components/charts/chartTheme";

/** One column per month; colour by sign, zero baseline. Click a month to select it. */
export default function NetOverTimeChart({
  data,
  selectedMonth,
  onSelectMonth,
  height = 260,
}: {
  data: { month: string; net: number }[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Not enough history yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="month"
          tickFormatter={monthShort}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
        />
        <YAxis
          tickFormatter={(v) => money(v, true)}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <ReferenceLine y={0} stroke={CHART.axis} />
        <Tooltip
          cursor={{ fill: CHART.grid, fillOpacity: 0.4 }}
          content={
            <ChartTooltip valueFormat={money} labelFormat={monthLong} />
          }
        />
        <Bar
          dataKey="net"
          name="Net"
          maxBarSize={30}
          radius={[3, 3, 0, 0]}
          onClick={(d) => {
            const month = (d?.payload as { month?: string } | undefined)?.month;
            if (month) onSelectMonth(month);
          }}
          className="cursor-pointer"
        >
          {data.map((d) => (
            <Cell
              key={d.month}
              fill={d.net < 0 ? CHART.neg : CHART.pos}
              fillOpacity={
                selectedMonth === null || d.month === selectedMonth ? 1 : 0.45
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
