"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReconciledTransaction } from "@/lib/transactions/types";

export default function TransactionCard({
  transaction,
}: {
  transaction: ReconciledTransaction;
}) {
  const out = transaction.amount < 0;
  const [merchant, ...rest] = transaction.description.split(" - ");

  return (
    <Card className="gap-0 py-5 shadow-md">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={transaction.group === "shared" ? "outline" : "secondary"}
            className={cn(
              "capitalize",
              transaction.group === "shared" && "border-info/40 text-info",
            )}
          >
            {transaction.group}
          </Badge>
          {transaction.transferState === "cross_group" && (
            <Badge variant="outline" className="border-info/40 text-info">
              cross-group transfer
            </Badge>
          )}
          {transaction.transferState === "unmatched" && (
            <Badge variant="outline" className="border-warning/40 text-warning">
              unmatched transfer
            </Badge>
          )}
          <span className="text-muted-foreground ml-auto text-xs">
            {formatDate(transaction.date)}
          </span>
        </div>

        <div
          className={cn(
            "text-4xl font-bold tracking-tight tabular-nums",
            out ? "text-destructive" : "text-success",
          )}
        >
          {out ? "−" : "+"}${Math.abs(transaction.amount).toFixed(2)}
        </div>

        <div className="space-y-0.5">
          <div className="font-medium">{merchant}</div>
          {rest.length > 0 && (
            <div className="text-muted-foreground text-xs break-words">
              {rest.join(" · ")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
