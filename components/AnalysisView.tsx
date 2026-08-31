"use client";

import { Fragment, useMemo, useState } from "react";

import GroupChartPanel, {
  type ChartTab,
} from "@/components/charts/GroupChartPanel";
import DangerZone from "@/components/DangerZone";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StoredTransaction } from "@/lib/db/transactions";
import { formatMoney, formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  budgetDeck,
  buildReviewSummary,
  categorizationsFromStored,
  filterByPeriod,
  listMonths,
  monthPeriod,
  perMonthTotals,
  periodTotals,
  previousMonth,
  type Period,
} from "@/lib/transactions/summary";

type Mode = "month" | "range";

const CHART_TABS: [ChartTab, string][] = [
  ["category", "Category"],
  ["net", "Over time"],
  ["inout", "In vs out"],
  ["composition", "Composition"],
];

const monthName = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
};

const netClass = (n: number) => (n < 0 ? "text-destructive" : "text-success");

export default function AnalysisView({
  transactions,
}: {
  transactions: StoredTransaction[];
}) {
  const categorizations = useMemo(
    () => categorizationsFromStored(transactions),
    [transactions],
  );
  const months = useMemo(
    () => listMonths(budgetDeck(transactions)),
    [transactions],
  );
  const allMonths = useMemo(
    () => perMonthTotals(transactions),
    [transactions],
  );
  const groups = useMemo(
    () =>
      [...new Set(allMonths.flatMap((m) => Object.keys(m.net)))].sort(),
    [allMonths],
  );

  const [mode, setMode] = useState<Mode>("month");
  const [monthIndex, setMonthIndex] = useState<number | null>(null);
  const [range, setRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [chartTab, setChartTab] = useState<ChartTab>("category");

  const selectMonth = (month: string) => {
    setMode("month");
    setMonthIndex(months.indexOf(month));
  };

  if (months.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          Nothing to analyse yet — import and categorize some transactions in the{" "}
          <span className="text-foreground">Work</span> tab first.
        </CardContent>
      </Card>
    );
  }

  const activeMonthIndex =
    monthIndex === null
      ? months.length - 1
      : Math.max(0, Math.min(monthIndex, months.length - 1));
  const activeMonth = months[activeMonthIndex];

  const period: Period =
    mode === "month"
      ? monthPeriod(activeMonth)
      : { from: range.from || undefined, to: range.to || undefined };

  const slice = filterByPeriod(transactions, period);
  const summary = buildReviewSummary(slice, categorizations);
  const totals = periodTotals(slice);

  const prevSummary =
    mode === "month" && activeMonthIndex > 0
      ? buildReviewSummary(
          filterByPeriod(transactions, monthPeriod(previousMonth(activeMonth))),
          categorizations,
        )
      : null;
  const prevNet = new Map<string, number>();
  for (const g of prevSummary?.groups ?? []) {
    for (const c of g.categories) prevNet.set(`${g.group}/${c.category}`, c.net);
  }

  const unreviewed = budgetDeck(slice).filter(
    (t) => t.status === "pending" || t.status === "skipped",
  ).length;

  return (
    <div className="space-y-5">
      {/* period picker */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted flex rounded-md p-0.5 text-sm">
          {(["month", "range"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2.5 py-1 font-medium capitalize transition-colors",
                mode === m
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "range" ? "Custom range" : "Month"}
            </button>
          ))}
        </div>

        {mode === "month" ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              disabled={activeMonthIndex === 0}
              onClick={() => setMonthIndex(activeMonthIndex - 1)}
            >
              ‹
            </Button>
            <Select
              value={activeMonth}
              onValueChange={(v) => setMonthIndex(months.indexOf(v))}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...months].reverse().map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              disabled={activeMonthIndex === months.length - 1}
              onClick={() => setMonthIndex(activeMonthIndex + 1)}
            >
              ›
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="w-40"
              aria-label="From date"
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="w-40"
              aria-label="To date"
            />
          </div>
        )}
      </div>

      {/* per-group headline */}
      <div className="grid gap-2 sm:grid-cols-2">
        {totals.length === 0 ? (
          <Card className="sm:col-span-2">
            <CardContent className="text-muted-foreground py-8 text-center text-sm">
              No categorized transactions in this period.
            </CardContent>
          </Card>
        ) : (
          totals.map((g) => (
            <div key={g.group} className="rounded-lg border p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-medium capitalize">{g.group}</span>
                <span
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    netClass(g.net),
                  )}
                >
                  {formatSigned(g.net)}
                </span>
              </div>
              <div className="text-muted-foreground mt-1 flex gap-3 text-xs tabular-nums">
                <span>in {formatMoney(g.income)}</span>
                <span>out {formatMoney(g.expense)}</span>
                <span>{g.count} txns</span>
              </div>
            </div>
          ))
        )}
      </div>

      {unreviewed > 0 && (
        <p className="text-muted-foreground text-sm">
          {unreviewed} transaction{unreviewed === 1 ? "" : "s"} in this period
          still need categorizing —{" "}
          <a href="/" className="text-foreground underline underline-offset-2">
            go to Work →
          </a>
        </p>
      )}

      {/* per-group charts + breakdown */}
      <div className="bg-muted inline-flex rounded-md p-0.5 text-sm">
        {CHART_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setChartTab(key)}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              chartTab === key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {summary.groups.map((group) => (
        <Card key={group.group}>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="capitalize">{group.group}</CardTitle>
            <span className={cn("font-semibold tabular-nums", netClass(group.net))}>
              {formatSigned(group.net)}
            </span>
          </CardHeader>
          <CardContent>
            <GroupChartPanel
              transactions={transactions}
              group={group.group}
              tab={chartTab}
              periodCategories={group.categories}
              selectedMonth={mode === "month" ? activeMonth : null}
              onSelectMonth={selectMonth}
            />
            <div className="mt-4 border-t pt-2">
              <Table>
              <TableBody>
                {group.categories.map((category) => {
                  const prior = prevNet.get(`${group.group}/${category.category}`);
                  const delta =
                    prior === undefined ? null : category.net - prior;
                  return (
                    <Fragment key={category.category}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="pt-3 font-medium">
                          {category.category}
                        </TableCell>
                        <TableCell className="text-muted-foreground pt-3 text-right text-xs tabular-nums">
                          {delta === null || Math.abs(delta) < 0.005
                            ? ""
                            : `${delta < 0 ? "▼" : "▲"} ${formatMoney(Math.abs(delta))} vs prev`}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "pt-3 text-right font-medium tabular-nums",
                            netClass(category.net),
                          )}
                        >
                          {formatSigned(category.net)}
                        </TableCell>
                      </TableRow>
                      {category.subcategories.map((sub) => (
                        <TableRow
                          key={sub.subcategory}
                          className="text-muted-foreground border-0 hover:bg-transparent"
                        >
                          <TableCell className="py-0.5 pl-6">
                            {sub.subcategory}
                          </TableCell>
                          <TableCell className="py-0.5 text-right tabular-nums">
                            {sub.count}
                          </TableCell>
                          <TableCell className="py-0.5 text-right tabular-nums">
                            {formatSigned(sub.net)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* all-months overview */}
      <Card>
        <CardHeader>
          <CardTitle>Every month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  {groups.map((g) => (
                    <TableHead key={g} className="text-right capitalize">
                      {g}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...allMonths].reverse().map((m) => (
                  <TableRow
                    key={m.month}
                    className="cursor-pointer"
                    onClick={() => {
                      setMode("month");
                      setMonthIndex(months.indexOf(m.month));
                    }}
                  >
                    <TableCell
                      className={cn(
                        "whitespace-nowrap",
                        mode === "month" && m.month === activeMonth
                          ? "font-semibold"
                          : "",
                      )}
                    >
                      {monthName(m.month)}
                    </TableCell>
                    {groups.map((g) => (
                      <TableCell
                        key={g}
                        className={cn(
                          "text-right tabular-nums",
                          m.net[g] === undefined
                            ? "text-muted-foreground"
                            : netClass(m.net[g]),
                        )}
                      >
                        {m.net[g] === undefined ? "—" : formatSigned(m.net[g])}
                      </TableCell>
                    ))}
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        netClass(m.total),
                      )}
                    >
                      {formatSigned(m.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <DangerZone />
    </div>
  );
}
