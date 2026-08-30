/**
 * The categorization layer that sits on top of the imported transactions, plus
 * the end-of-batch review aggregation.
 *
 * Pure and unit-tested — no React, no storage.
 */

import type { Flag, WrongAccountData } from "../db/flags.ts";
import type { StoredTransaction } from "../db/transactions.ts";
import { isBudgetRelevant } from "./reconcile.ts";
import type { ReconciledTransaction } from "./types.ts";

export interface Categorization {
  category: string;
  subcategory: string;
}

/**
 * Transaction id -> its categorization.
 *   - a `Categorization` object: categorized
 *   - `null`: explicitly skipped
 *   - absent: not looked at yet
 */
export type CategorizationMap = Record<string, Categorization | null>;

/**
 * The transactions that belong in the review deck: everything the budget cares
 * about, i.e. all but netted inter-account transfers.
 */
export function budgetDeck<T extends ReconciledTransaction>(
  transactions: T[],
): T[] {
  return transactions.filter(isBudgetRelevant);
}

export interface SubcategoryTotal {
  subcategory: string;
  net: number;
  count: number;
}

export interface CategoryTotal {
  category: string;
  net: number;
  count: number;
  subcategories: SubcategoryTotal[];
}

export interface GroupSummary {
  group: string;
  net: number;
  count: number;
  categories: CategoryTotal[];
}

export interface ReviewSummary {
  /** Size of the review deck (excludes netted transfers). */
  total: number;
  categorized: number;
  skipped: number;
  /** In the deck but never looked at. */
  pending: number;
  /** Netted transfers left out of the deck entirely. */
  nettedExcluded: number;
  /** Cross-group transfers that stayed in the deck. */
  crossGroupKept: number;
  /** Per group, then per category, then per subcategory — sorted by |net| desc. */
  groups: GroupSummary[];
  skippedTransactions: ReconciledTransaction[];
}

export function buildReviewSummary(
  transactions: ReconciledTransaction[],
  categorizations: CategorizationMap,
): ReviewSummary {
  const deck = budgetDeck(transactions);

  let categorized = 0;
  let skipped = 0;
  let pending = 0;
  const skippedTransactions: ReconciledTransaction[] = [];

  // group -> category -> subcategory -> running total
  const tree = new Map<string, Map<string, Map<string, SubcategoryTotal>>>();

  for (const t of deck) {
    const entry = categorizations[t.id];

    if (entry === undefined) {
      pending += 1;
      continue;
    }
    if (entry === null) {
      skipped += 1;
      skippedTransactions.push(t);
      continue;
    }

    categorized += 1;

    const categories = mapGet(tree, t.group, () => new Map());
    const subcategories = mapGet(categories, entry.category, () => new Map());
    const bucket = mapGet(subcategories, entry.subcategory, () => ({
      subcategory: entry.subcategory,
      net: 0,
      count: 0,
    }));
    bucket.net = round2(bucket.net + t.amount);
    bucket.count += 1;
  }

  const groups: GroupSummary[] = [...tree.entries()]
    .map(([group, categories]) => {
      const categoryTotals: CategoryTotal[] = [...categories.entries()]
        .map(([category, subs]) => {
          const subcategories = [...subs.values()].sort(byAbsNetDesc);
          return {
            category,
            subcategories,
            net: round2(sum(subcategories.map((s) => s.net))),
            count: sum(subcategories.map((s) => s.count)),
          };
        })
        .sort(byAbsNetDesc);

      return {
        group,
        categories: categoryTotals,
        net: round2(sum(categoryTotals.map((c) => c.net))),
        count: sum(categoryTotals.map((c) => c.count)),
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group));

  return {
    total: deck.length,
    categorized,
    skipped,
    pending,
    nettedExcluded: transactions.filter((t) => t.transferState === "netted").length,
    crossGroupKept: transactions.filter((t) => t.transferState === "cross_group")
      .length,
    groups,
    skippedTransactions,
  };
}

export interface FlaggedTxn {
  txn: StoredTransaction;
  flag: Flag;
}

export interface FollowUps {
  /** Wrong-account flags (open first, then resolved), oldest transaction first. */
  wrongAccount: FlaggedTxn[];
  /** Free-text note flags, oldest transaction first. */
  notes: FlaggedTxn[];
  /** Transaction id → the wrong-account flag(s) it was linked as the fix for. */
  correctionFor: Record<string, { flag: Flag; original: StoredTransaction }[]>;
}

/**
 * Pull the follow-up annotations out of a transaction set for the review screen.
 * Pure — the totals are untouched (flags are annotation-only).
 */
export function collectFollowUps(
  transactions: StoredTransaction[],
): FollowUps {
  const wrongAccount: FlaggedTxn[] = [];
  const notes: FlaggedTxn[] = [];
  const correctionFor: FollowUps["correctionFor"] = {};

  for (const txn of transactions) {
    for (const flag of txn.flags ?? []) {
      if (flag.kind === "wrong_account") {
        wrongAccount.push({ txn, flag });
        const correctedBy = (flag.data as WrongAccountData).correctedByTxnId;
        if (flag.status === "resolved" && correctedBy) {
          (correctionFor[correctedBy] ??= []).push({ flag, original: txn });
        }
      } else if (flag.kind === "note") {
        notes.push({ txn, flag });
      }
    }
  }

  const byDate = (a: FlaggedTxn, b: FlaggedTxn) =>
    a.txn.date.localeCompare(b.txn.date) || a.txn.id.localeCompare(b.txn.id);
  const openFirst = (a: FlaggedTxn, b: FlaggedTxn) =>
    Number(a.flag.status === "resolved") - Number(b.flag.status === "resolved");

  wrongAccount.sort((a, b) => openFirst(a, b) || byDate(a, b));
  notes.sort(byDate);

  return { wrongAccount, notes, correctionFor };
}

function mapGet<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
}

function byAbsNetDesc(a: { net: number }, b: { net: number }): number {
  return Math.abs(b.net) - Math.abs(a.net);
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
