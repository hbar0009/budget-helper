"use client";

import { Fragment, useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import FollowUpSection from "@/components/FollowUpSection";
import ReimbursementSection from "@/components/ReimbursementSection";
import { StatCard } from "@/components/StatCard";
import type { StoredTransaction } from "@/lib/db/transactions";
import { formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  budgetDeck,
  buildReviewSummary,
  collectFollowUps,
  collectReimbursements,
  isRepaymentCandidate,
  type CategorizationMap,
} from "@/lib/transactions/summary";

type Result = { ok: boolean; error?: string };

interface Props {
  transactions: StoredTransaction[];
  categorizations: CategorizationMap;
  onUpdateFlag: (flagId: string, body: Record<string, unknown>) => Promise<Result>;
  onDeleteFlag: (flagId: string) => Promise<Result>;
  onUpdateClaim: (
    claimId: string,
    body: Record<string, unknown>,
  ) => Promise<Result>;
  onDeleteClaim: (claimId: string) => Promise<Result>;
  onRecordRepayment: (
    claimId: string,
    body: { txnId: string | null; amount: number },
  ) => Promise<Result>;
  onDeleteRepayment: (repaymentId: string) => Promise<Result>;
  onBack: () => void;
  onReset: () => void;
}

export default function ReviewStage({
  transactions,
  categorizations,
  onUpdateFlag,
  onDeleteFlag,
  onUpdateClaim,
  onDeleteClaim,
  onRecordRepayment,
  onDeleteRepayment,
  onBack,
  onReset,
}: Props) {
  const summary = useMemo(
    () => buildReviewSummary(transactions, categorizations),
    [transactions, categorizations],
  );
  const followUps = useMemo(
    () => collectFollowUps(transactions),
    [transactions],
  );
  const reimbursements = useMemo(
    () => collectReimbursements(transactions),
    [transactions],
  );
  const candidateCredits = useMemo(
    () => transactions.filter(isRepaymentCandidate),
    [transactions],
  );

  function downloadCsv() {
    const header = [
      "date",
      "group",
      "account",
      "description",
      "amount",
      "category",
      "subcategory",
      "transfer_state",
    ];
    const rows = budgetDeck(transactions).map((t) => {
      const entry = categorizations[t.id];
      return [
        t.date,
        t.group,
        t.accountId,
        t.description,
        t.amount.toFixed(2),
        entry === undefined
          ? "PENDING"
          : entry === null
            ? "SKIPPED"
            : entry.category,
        entry ? entry.subcategory : "",
        t.transferState,
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map(csvCell).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "categorized-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="In deck" value={summary.total} />
        <StatCard label="Categorized" value={summary.categorized} />
        <StatCard label="Skipped" value={summary.skipped} />
        <StatCard label="Pending" value={summary.pending} />
        <StatCard
          label="Netted transfers"
          value={summary.nettedExcluded}
          hint="excluded"
        />
        <StatCard
          label="Cross-group"
          value={summary.crossGroupKept}
          hint="kept"
        />
      </div>

      {summary.groups.map((group) => (
        <Card key={group.group}>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle className="capitalize">{group.group}</CardTitle>
            <span
              className={cn(
                "font-semibold tabular-nums",
                group.net < 0 ? "text-destructive" : "text-success",
              )}
            >
              {formatSigned(group.net)}
            </span>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {group.categories.map((category) => (
                  <Fragment key={category.category}>
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="pt-3 font-medium">
                        {category.category}
                      </TableCell>
                      <TableCell className="text-muted-foreground pt-3 text-right tabular-nums">
                        {category.count}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "pt-3 text-right font-medium tabular-nums",
                          category.net < 0
                            ? "text-destructive"
                            : "text-success",
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {summary.groups.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            Nothing categorized yet.
          </CardContent>
        </Card>
      )}

      {summary.skippedTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Skipped ({summary.skippedTransactions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {summary.skippedTransactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">
                      {t.date}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {t.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <FollowUpSection
        followUps={followUps}
        transactions={transactions}
        onUpdateFlag={onUpdateFlag}
        onDeleteFlag={onDeleteFlag}
      />

      <ReimbursementSection
        reimbursements={reimbursements}
        candidateCredits={candidateCredits}
        onUpdateClaim={onUpdateClaim}
        onDeleteClaim={onDeleteClaim}
        onRecordRepayment={onRecordRepayment}
        onDeleteRepayment={onDeleteRepayment}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          ← Back to cards
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadCsv}>
            Download CSV
          </Button>
          <Button disabled title="Sheet sync is the next feature">
            Sync to Google Sheets
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        CSV export is a stopgap. Writing to Google Sheets / Excel via the
        per-group <code className="text-foreground">sink</code> is the next
        feature. Everything is saved in the local database as you go.
      </p>

      <Button variant="ghost" size="sm" onClick={onReset}>
        Clear all data
      </Button>
    </div>
  );
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
