"use client";

import { useMemo, useState } from "react";
import {
  FlagIcon,
  RotateCwIcon,
  Undo2Icon,
  UsersIcon,
} from "lucide-react";

import FlagChips from "@/components/FlagChips";
import ReimbursementChip from "@/components/ReimbursementChip";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoredTransaction } from "@/lib/db/transactions";

interface Props {
  transactions: StoredTransaction[];
  onUndo: (id: string) => void;
  onFlag: (txnId: string) => void;
  onSplit: (txnId: string) => void;
  onRerun: () => Promise<void> | void;
  onContinue: () => void;
}

interface Group {
  label: string;
  category: string;
  subcategory: string;
  rows: StoredTransaction[];
}

export default function AutoReviewStage({
  transactions,
  onUndo,
  onFlag,
  onSplit,
  onRerun,
  onContinue,
}: Props) {
  const [rerunning, setRerunning] = useState(false);

  const groups = useMemo<Group[]>(() => {
    const byLabel = new Map<string, Group>();
    for (const t of transactions) {
      if (t.categorizedBy !== "rule") continue;
      const label = t.ruleLabel ?? "rule";
      let group = byLabel.get(label);
      if (!group) {
        group = {
          label,
          category: t.category ?? "",
          subcategory: t.subcategory ?? "",
          rows: [],
        };
        byLabel.set(label, group);
      }
      group.rows.push(t);
    }
    return [...byLabel.values()];
  }, [transactions]);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  async function rerun() {
    setRerunning(true);
    try {
      await onRerun();
    } finally {
      setRerunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Auto-categorized</CardTitle>
          <CardDescription>
            {total} transaction{total === 1 ? "" : "s"} matched a rule. Undo any
            that look wrong — they&apos;ll go back into the deck.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={onContinue}>Continue to categorize →</Button>
          <Button variant="outline" onClick={rerun} disabled={rerunning}>
            <RotateCwIcon />
            {rerunning ? "Re-running…" : "Re-run rules"}
          </Button>
        </CardContent>
      </Card>

      {groups.map((group) => (
        <Card key={group.label}>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{group.label}</CardTitle>
              <CardDescription>
                → {group.category} / {group.subcategory} · {group.rows.length}{" "}
                row{group.rows.length === 1 ? "" : "s"}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => group.rows.forEach((r) => onUndo(r.id))}
            >
              Undo all
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {group.rows.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 border-b py-1.5 text-sm last:border-0"
              >
                <span className="text-muted-foreground w-24 shrink-0 tabular-nums">
                  {t.date}
                </span>
                <span
                  className={cn(
                    "w-16 shrink-0 text-xs capitalize",
                    t.group === "shared"
                      ? "text-info"
                      : "text-muted-foreground",
                  )}
                >
                  {t.group}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate">{t.description}</span>
                  <FlagChips flags={t.flags} />
                  <ReimbursementChip claims={t.claims} />
                </span>
                <span
                  className={
                    "shrink-0 tabular-nums " +
                    (t.amount < 0 ? "text-destructive" : "text-success")
                  }
                >
                  {formatSigned(t.amount)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="Flag"
                  onClick={() => onFlag(t.id)}
                >
                  <FlagIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="Split / reimbursement"
                  onClick={() => onSplit(t.id)}
                >
                  <UsersIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="Undo"
                  onClick={() => onUndo(t.id)}
                >
                  <Undo2Icon />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {groups.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            Nothing is auto-categorized right now.
            <div className="mt-3">
              <Button onClick={onContinue}>Continue to categorize →</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
