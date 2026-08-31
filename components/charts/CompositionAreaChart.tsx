"use client";

import {
  Area,
  AreaChart,
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
  bandColor,
  money,
  monthLong,
  monthShort,
} from "@/components/charts/chartTheme";

/**
 * Monthly spend split into category bands (top 6 + "Other"). Stacked area —
 * legend shown by the caller. Click a month to select it.
 */
export default function CompositionAreaChart({
  rows,
  categories,
  selectedMonth,
  onSelectMonth,
  height = 260,
}: {
  rows: Record<string, string | number>[];
  categories: string[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
  height?: number;
}) {
  if (rows.length === 0 || categories.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No expense data yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
        onClick={(next) => {
          const label = next?.activeLabel;
          if (typeof label === "string") onSelectMonth(label);
        }}
        className="cursor-pointer"
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
        {selectedMonth && (
          <ReferenceLine x={selectedMonth} stroke={CHART.label} strokeOpacity={0.4} />
        )}
        <Tooltip
          content={
            <ChartTooltip
              valueFormat={(n) => money(-n)}
              labelFormat={monthLong}
              extra={(rs) => {
                const total = rs.reduce((s, r) => s + (r.value ?? 0), 0);
                return (
                  <div className="mt-1 flex items-center gap-2 border-t pt-1">
                    <span className="inline-block h-[2px] w-3 shrink-0" />
                    <span className="text-muted-foreground flex-1">Total</span>
                    <span className="font-semibold tabular-nums">
                      {money(-total)}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        {categories.map((name, i) => (
          <Area
            key={name}
            type="monotone"
            dataKey={name}
            name={name}
            stackId="spend"
            stroke={CHART.surface}
            strokeWidth={2}
            fill={bandColor(i, name)}
            fillOpacity={0.9}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
