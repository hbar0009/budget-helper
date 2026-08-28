/**
 * The categorization layer that sits on top of the imported transactions, plus
 * the end-of-batch review aggregation.
 *
 * Pure and unit-tested — no React, no storage.
 */

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
export function budgetDeck(
  transactions: ReconciledTransaction[],
): ReconciledTransaction[] {
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
