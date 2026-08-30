/**
 * Turn stored transactions into the rows a sink writes, grouped by account
 * group (each group has its own spreadsheet).
 *
 * Pure and unit-tested — no storage, no network.
 */

import type { Account } from "../accounts/config.ts";
import type { Claim } from "../db/reimbursements.ts";
import type { StoredTransaction } from "../db/transactions.ts";
import { isBudgetRelevant } from "../transactions/reconcile.ts";
import type { SinkRow } from "./types.ts";

/**
 * A transaction reaches the spreadsheet iff it is:
 *   - categorized (pending / skipped / excluded stay out),
 *   - budget-relevant (netted inter-account transfers stay out),
 *   - not itself a repayment credit — its money is already folded into the
 *     fronted debit's `net`, so a row of its own would double-count.
 */
export function isSinkable(t: StoredTransaction): boolean {
  return (
    t.status === "categorized" &&
    isBudgetRelevant(t) &&
    (t.repaymentsFunded ?? []).length === 0
  );
}

function reimbStatus(claims: Claim[], repaid: number): SinkRow["reimbStatus"] {
  if (claims.length === 0) return "";
  if (claims.every((c) => c.status === "settled")) return "settled";
  return repaid > 0 ? "partial" : "open";
}

function toSinkRow(t: StoredTransaction, accountLabel: string): SinkRow {
  const claims = t.claims ?? [];
  const repaid = round2(claims.reduce((sum, c) => sum + c.repaid, 0));
  // Repayments offset the transaction toward zero, whichever way it points.
  const reimbursed = t.amount < 0 ? repaid : -repaid;
  const owedBy = [...new Set(claims.map((c) => c.person))].join(", ");

  return {
    id: t.id,
    date: t.date,
    description: t.description,
    account: accountLabel,
    category: t.category ?? "",
    subcategory: t.subcategory ?? "",
    gross: round2(t.amount),
    reimbursed,
    net: round2(t.amount + reimbursed),
    reimbStatus: reimbStatus(claims, repaid),
    owedBy,
  };
}

/**
 * Group -> its sink rows, each list sorted by date then id (stable output, so a
 * re-push diffs cleanly). Groups with no sinkable rows are omitted.
 */
export function buildSinkRowsByGroup(
  transactions: StoredTransaction[],
  accounts: Account[],
): Record<string, SinkRow[]> {
  const labels = new Map(accounts.map((a) => [a.id, a.label]));
  const byGroup: Record<string, SinkRow[]> = {};

  for (const t of transactions) {
    if (!isSinkable(t)) continue;
    (byGroup[t.group] ??= []).push(toSinkRow(t, labels.get(t.accountId) ?? t.accountId));
  }

  for (const rows of Object.values(byGroup)) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
  return byGroup;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
