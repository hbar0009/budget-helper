"use client";

import { useMemo } from "react";

import CategoryBarChart from "@/components/charts/CategoryBarChart";
import { CHART, bandColor } from "@/components/charts/chartTheme";
import CompositionAreaChart from "@/components/charts/CompositionAreaChart";
import InOutChart from "@/components/charts/InOutChart";
import NetOverTimeChart from "@/components/charts/NetOverTimeChart";
import type { StoredTransaction } from "@/lib/db/transactions";
import {
  monthlyExpenseByCategory,
  monthlyInOut,
  perMonthTotals,
  type CategoryTotal,
} from "@/lib/transactions/summary";

export type ChartTab = "category" | "net" | "inout" | "composition";

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="text-muted-foreground mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {items.map((it) => (
        <li key={it.name} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2 shrink-0 rounded-[2px]"
            style={{ background: it.color }}
          />
          {it.name}
        </li>
      ))}
    </ul>
  );
}

export default function GroupChartPanel({
  transactions,
  group,
  tab,
  periodCategories,
  selectedMonth,
  onSelectMonth,
}: {
  transactions: StoredTransaction[];
  group: string;
  tab: ChartTab;
  /** This group's category totals for the selected period. */
  periodCategories: CategoryTotal[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}) {
  const netData = useMemo(
    () =>
      perMonthTotals(transactions)
        .filter((m) => group in m.net)
        .map((m) => ({ month: m.month, net: m.net[group] })),
    [transactions, group],
  );
  const ioData = useMemo(
    () => monthlyInOut(transactions, group),
    [transactions, group],
  );
  const composition = useMemo(
    () => monthlyExpenseByCategory(transactions, group),
    [transactions, group],
  );

  if (tab === "category") {
    const data = periodCategories
      .filter((c) => c.net < 0)
      .map((c) => ({ category: c.category, amount: -c.net }));
    return <CategoryBarChart data={data} />;
  }

  if (tab === "net") {
    return (
      <NetOverTimeChart
        data={netData}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
      />
    );
  }

  if (tab === "inout") {
    return (
      <>
        <Legend
          items={[
            { name: "Income", color: CHART.pos },
            { name: "Expense", color: CHART.neg },
          ]}
        />
        <InOutChart data={ioData} onSelectMonth={onSelectMonth} />
      </>
    );
  }

  return (
    <>
      <Legend
        items={composition.categories.map((name, i) => ({
          name,
          color: bandColor(i, name),
        }))}
      />
      <CompositionAreaChart
        rows={composition.rows}
        categories={composition.categories}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
      />
    </>
  );
}
