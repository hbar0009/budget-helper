/**
 * Stage 3: classify inter-account transfers across the whole upload batch.
 *
 * A transfer between two of your accounts shows up twice — a debit in the
 * source file, a credit in the destination file. We pair those legs up by
 * amount, date, and any of three counterparty signals (in order of strength):
 * a shared bank receipt number, one leg naming the other account's number, or
 * both legs saying "internal transfer". Pairs are labelled:
 *
 *   - same group    -> "netted"      (dropped from the budget)
 *   - across groups  -> "cross_group" (kept: funding the shared account is worth
 *                                      recording in both budgets)
 *   - no partner leg -> "unmatched"   (only if the row has a strong transfer
 *                                      signal; otherwise it stays "none")
 *
 * Everything else stays "none".
 */

import { createHash } from "node:crypto";
import type { Account } from "../accounts/config.ts";
import type {
  AccountTransaction,
  ReconciledTransaction,
  TransferState,
  TransferSummary,
} from "./types.ts";

/** Strong signal: an unambiguous inter-account transfer. */
const STRICT_TRANSFER = /internal transfer/i;
/** Weak signal: the word "transfer" anywhere (banks phrase corrections oddly,
 *  e.g. "Fix for another incorrect transfer - ... - To Orange Everyday"). */
const TRANSFER_HINT = /\btransfer\b/i;
/** Both legs of a transfer carry the same bank receipt number. */
const RECEIPT_RE = /\breceipt\s+#?\s*(\d+)/i;

/** Same-bank transfers settle instantly, so the two legs share a date almost
 *  always; 1 day of slack covers a near-midnight posting. */
const DEFAULT_MAX_DAYS_APART = 1;

/** Cents of tolerance when comparing the two legs' amounts. */
const AMOUNT_EPSILON = 0.005;

export interface ReconcileOptions {
  maxDaysApart?: number;
}

export function reconcileTransfers(
  transactions: AccountTransaction[],
  accounts: Account[],
  options: ReconcileOptions = {},
): { transactions: ReconciledTransaction[]; summary: TransferSummary } {
  const maxDaysApart = options.maxDaysApart ?? DEFAULT_MAX_DAYS_APART;
  const groupOf = new Map(accounts.map((a) => [a.id, a.group]));

  const rows: ReconciledTransaction[] = transactions.map((t) => ({
    ...t,
    transferState: "none",
    transferPairId: null,
    counterpartyAccountId: findCounterparty(t, accounts),
  }));

  // A row is worth *considering* for pairing if it names another account by
  // number or just mentions a "transfer". Weak matches that don't pair fall
  // back to "none" further down, so this net can be cast wide.
  const candidates = rows.filter(
    (r) => r.counterpartyAccountId !== null || TRANSFER_HINT.test(r.description),
  );
  const credits = candidates.filter((r) => r.amount > 0);
  const usedCredits = new Set<string>();

  let nettedPairs = 0;
  let crossGroupPairs = 0;

  for (const debit of candidates) {
    if (debit.amount >= 0) continue;

    const credit = credits.find(
      (c) =>
        !usedCredits.has(c.id) &&
        c.accountId !== debit.accountId &&
        Math.abs(c.amount + debit.amount) < AMOUNT_EPSILON &&
        daysApart(c.date, debit.date) <= maxDaysApart &&
        counterpartyConsistent(debit, c),
    );
    if (!credit) continue;

    usedCredits.add(credit.id);
    const pairId = makePairId(debit.id, credit.id);
    const sameGroup =
      groupOf.get(debit.accountId) === groupOf.get(credit.accountId);
    const state: TransferState = sameGroup ? "netted" : "cross_group";

    for (const leg of [debit, credit]) {
      leg.transferState = state;
      leg.transferPairId = pairId;
    }
    debit.counterpartyAccountId ??= credit.accountId;
    credit.counterpartyAccountId ??= debit.accountId;

    if (sameGroup) nettedPairs += 1;
    else crossGroupPairs += 1;
  }

  // A leftover candidate is only "unmatched" (i.e. flagged for review) when it
  // clearly looks like a transfer. A row that merely contains the word
  // "transfer" but has no pair is almost certainly an ordinary payment.
  let unmatched = 0;
  for (const candidate of candidates) {
    if (candidate.transferState !== "none") continue;
    const strong =
      candidate.counterpartyAccountId !== null ||
      STRICT_TRANSFER.test(candidate.description);
    if (strong) {
      candidate.transferState = "unmatched";
      unmatched += 1;
    }
  }

  return {
    transactions: rows,
    summary: { nettedPairs, crossGroupPairs, unmatched },
  };
}

/** Which categorized rows should actually reach a spreadsheet. */
export function isBudgetRelevant(t: ReconciledTransaction): boolean {
  return t.transferState !== "netted";
}

/** The other account referenced in a row's description, by account number. */
function findCounterparty(
  t: AccountTransaction,
  accounts: Account[],
): string | null {
  const other = accounts.find(
    (a) => a.id !== t.accountId && a.number && t.description.includes(a.number),
  );
  return other?.id ?? null;
}

/** The bank receipt number in a description, if any. */
function receiptNumber(description: string): string | null {
  const match = description.match(RECEIPT_RE);
  return match ? match[1] : null;
}

function counterpartyConsistent(
  a: ReconciledTransaction,
  b: ReconciledTransaction,
): boolean {
  // Strongest signal: the bank stamps both legs of a transfer with one receipt
  // number. Trust it even when a description misnames the other account
  // (common on "fix for incorrect transfer" corrections).
  const receiptA = receiptNumber(a.description);
  const receiptB = receiptNumber(b.description);
  if (receiptA && receiptB) return receiptA === receiptB;

  if (a.counterpartyAccountId && a.counterpartyAccountId !== b.accountId) {
    return false;
  }
  if (b.counterpartyAccountId && b.counterpartyAccountId !== a.accountId) {
    return false;
  }
  // Neither leg names an account number: only pair them if both explicitly say
  // "internal transfer", so two coincidental same-amount rows don't merge.
  if (!a.counterpartyAccountId && !b.counterpartyAccountId) {
    return STRICT_TRANSFER.test(a.description) && STRICT_TRANSFER.test(b.description);
  }
  return true;
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(
    Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`),
  );
  return Math.round(ms / 86_400_000);
}

function makePairId(a: string, b: string): string {
  return createHash("sha1").update([a, b].sort().join("|")).digest("hex");
}
