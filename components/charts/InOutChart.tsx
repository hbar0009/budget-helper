"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

/**
 * Income above the baseline, expense below, one column per month. Two series —
 * legend shown by the caller. Click a month to select it.
 */
export default function InOutChart({
  data,
  onSelectMonth,
  height = 260,
}: {
  data: { month: string; income: number; expense: number }[];
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

  const handleBarClick = (d: { payload?: { month?: string } }) => {
    const month = d?.payload?.month;
    if (month) onSelectMonth(month);
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        stackOffset="sign"
        margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
      >
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
          content={<ChartTooltip valueFormat={money} labelFormat={monthLong} />}
        />
        <Bar
          dataKey="income"
          name="Income"
          stackId="io"
          fill={CHART.pos}
          radius={[3, 3, 0, 0]}
          maxBarSize={30}
          onClick={handleBarClick}
          className="cursor-pointer"
        />
        <Bar
          dataKey="expense"
          name="Expense"
          stackId="io"
          fill={CHART.neg}
          radius={[3, 3, 0, 0]}
          maxBarSize={30}
          onClick={handleBarClick}
          className="cursor-pointer"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
