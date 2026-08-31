/**
 * The categorization layer that sits on top of the imported transactions, plus
 * the end-of-batch review aggregation.
 *
 * Pure and unit-tested — no React, no storage.
 */

import type { Flag, WrongAccountData } from "../db/flags.ts";
import type { Claim } from "../db/reimbursements.ts";
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

export interface ClaimRow {
  claim: Claim;
  txn: StoredTransaction;
}

export interface PersonOwed {
  person: string;
  /** Sum of still-outstanding amounts across this person's open claims. */
  openTotal: number;
  /** True if any open claim has no `expected` set yet. */
  hasUnknown: boolean;
  claims: ClaimRow[];
}

/** A credit that looks like it repays an open claim, by amount. */
export interface RepaymentHint {
  credit: StoredTransaction;
  claim: Claim;
  claimTxn: StoredTransaction;
}

export interface Reimbursements {
  anyClaims: boolean;
  /** Grouped by person, most owed first. */
  people: PersonOwed[];
  /** Unlinked credits whose amount matches an open claim's outstanding. */
  hints: RepaymentHint[];
}

/** Incoming credits that could be repayments: not own-account transfers. */
export function isRepaymentCandidate(t: ReconciledTransaction): boolean {
  return (
    t.amount > 0 &&
    (t.transferState === "none" || t.transferState === "unmatched")
  );
}

/**
 * Roll every transaction's reimbursement claims up by person for the review
 * screen, and flag unlinked credits that look like repayments. Pure — claims are
 * annotation-only, so the budget totals are untouched.
 */
export function collectReimbursements(
  transactions: StoredTransaction[],
): Reimbursements {
  const byPerson = new Map<string, PersonOwed>();
  const openClaims: { claim: Claim; txn: StoredTransaction }[] = [];

  for (const txn of transactions) {
    for (const claim of txn.claims ?? []) {
      const key = claim.person.toLowerCase();
      let entry = byPerson.get(key);
      if (!entry) {
        entry = {
          person: claim.person,
          openTotal: 0,
          hasUnknown: false,
          claims: [],
        };
        byPerson.set(key, entry);
      }
      entry.claims.push({ claim, txn });
      if (claim.status === "open") {
        openClaims.push({ claim, txn });
        if (claim.expected === null) entry.hasUnknown = true;
        else entry.openTotal = round2(entry.openTotal + (claim.outstanding ?? 0));
      }
    }
  }

  const people = [...byPerson.values()];
  for (const entry of people) {
    entry.claims.sort(
      (a, b) =>
        Number(a.claim.status !== "open") - Number(b.claim.status !== "open") ||
        a.txn.date.localeCompare(b.txn.date),
    );
  }
  people.sort(
    (a, b) => b.openTotal - a.openTotal || a.person.localeCompare(b.person),
  );

  const hints: RepaymentHint[] = [];
  for (const credit of transactions) {
    if (!isRepaymentCandidate(credit)) continue;
    if ((credit.repaymentsFunded ?? []).length > 0) continue;
    for (const { claim, txn } of openClaims) {
      if (
        claim.outstanding !== null &&
        claim.outstanding > 0 &&
        Math.abs(claim.outstanding - credit.amount) < 0.005
      ) {
        hints.push({ credit, claim, claimTxn: txn });
      }
    }
  }
  hints.sort((a, b) => a.credit.date.localeCompare(b.credit.date));

  return { anyClaims: people.length > 0, people, hints };
}

// ---------------------------------------------------------------------------
// History sliced by period — the Analysis view. All pure.
// ---------------------------------------------------------------------------

/** `"YYYY-MM"` from an ISO `YYYY-MM-DD` date. */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** The calendar month before `"YYYY-MM"` (e.g. `2026-01` -> `2025-12`). */
export function previousMonth(month: string): string {
  let [year, m] = month.split("-").map(Number);
  m -= 1;
  if (m === 0) {
    m = 12;
    year -= 1;
  }
  return `${year}-${String(m).padStart(2, "0")}`;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function lastDayOfMonth(year: number, month1: number): number {
  if (month1 === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
    return 29;
  }
  return DAYS_IN_MONTH[month1 - 1];
}

/** Sorted-ascending distinct `"YYYY-MM"` months present in the rows. */
export function listMonths(transactions: { date: string }[]): string[] {
  return [...new Set(transactions.map((t) => monthKey(t.date)))].sort();
}

export interface Period {
  /** Inclusive ISO `YYYY-MM-DD` bounds; omit either end for open-ended. */
  from?: string;
  to?: string;
}

/** The `Period` spanning a whole `"YYYY-MM"` month. */
export function monthPeriod(month: string): Period {
  const [year, m] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDayOfMonth(year, m)).padStart(2, "0")}`,
  };
}

/** Rows whose `date` falls inside `period` (inclusive). Plain string compare is
 *  correct for zero-padded ISO dates. */
export function filterByPeriod<T extends { date: string }>(
  transactions: T[],
  period: Period,
): T[] {
  return transactions.filter(
    (t) =>
      (period.from === undefined || t.date >= period.from) &&
      (period.to === undefined || t.date <= period.to),
  );
}

export interface GroupPeriodTotals {
  group: string;
  /** Sum of positive amounts (money in). */
  income: number;
  /** Sum of negative amounts (money out); <= 0. */
  expense: number;
  net: number;
  count: number;
}

/**
 * Income / expense / net per group over the rows you pass — feed it a period
 * slice. Counts only categorized, budget-relevant rows (same deck rules as the
 * review); pending and skipped rows are left out.
 */
export function periodTotals(
  transactions: StoredTransaction[],
): GroupPeriodTotals[] {
  const byGroup = new Map<string, GroupPeriodTotals>();
  for (const t of transactions) {
    if (!isBudgetRelevant(t) || t.status !== "categorized") continue;
    const g = mapGet(byGroup, t.group, () => ({
      group: t.group,
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    }));
    if (t.amount >= 0) g.income = round2(g.income + t.amount);
    else g.expense = round2(g.expense + t.amount);
    g.net = round2(g.net + t.amount);
    g.count += 1;
  }
  return [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group));
}

export interface MonthTotals {
  month: string;
  /** group -> net that month (categorized, budget-relevant). */
  net: Record<string, number>;
  /** Net across every group. */
  total: number;
}

/**
 * Net per group per month, oldest first — the all-months table, and the spine
 * that the Phase B charts and Phase C budget targets attach to.
 */
export function perMonthTotals(
  transactions: StoredTransaction[],
): MonthTotals[] {
  const byMonth = new Map<string, MonthTotals>();
  for (const t of transactions) {
    if (!isBudgetRelevant(t) || t.status !== "categorized") continue;
    const row = mapGet(byMonth, monthKey(t.date), () => ({
      month: monthKey(t.date),
      net: {} as Record<string, number>,
      total: 0,
    }));
    row.net[t.group] = round2((row.net[t.group] ?? 0) + t.amount);
    row.total = round2(row.total + t.amount);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface MonthInOut {
  month: string;
  /** Sum of positive amounts that month (>= 0). */
  income: number;
  /** Sum of negative amounts that month (<= 0). */
  expense: number;
  net: number;
}

/**
 * Income / expense / net per month for one group, oldest first — the
 * income-vs-expense chart. Categorized, budget-relevant rows only.
 */
export function monthlyInOut(
  transactions: StoredTransaction[],
  group: string,
): MonthInOut[] {
  const byMonth = new Map<string, MonthInOut>();
  for (const t of transactions) {
    if (!isBudgetRelevant(t) || t.status !== "categorized" || t.group !== group) {
      continue;
    }
    const row = mapGet(byMonth, monthKey(t.date), () => ({
      month: monthKey(t.date),
      income: 0,
      expense: 0,
      net: 0,
    }));
    if (t.amount >= 0) row.income = round2(row.income + t.amount);
    else row.expense = round2(row.expense + t.amount);
    row.net = round2(row.net + t.amount);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface MonthlyCategoryComposition {
  /** One row per month (oldest first): `{ month, [category]: expense magnitude }`,
   *  every `category` key present on every row (0 when absent) so the stacked
   *  chart has no gaps. */
  rows: Record<string, string | number>[];
  /** Category band order: the top `topN` by total spend, then `"Other"` if any
   *  were folded in. */
  categories: string[];
}

/**
 * Expense magnitude per category per month for one group — the monthly
 * composition (stacked area). The tail past `topN` folds into `"Other"`.
 */
export function monthlyExpenseByCategory(
  transactions: StoredTransaction[],
  group: string,
  topN = 6,
): MonthlyCategoryComposition {
  const total = new Map<string, number>();
  const byMonth = new Map<string, Map<string, number>>();

  for (const t of transactions) {
    if (
      !isBudgetRelevant(t) ||
      t.status !== "categorized" ||
      t.group !== group ||
      t.amount >= 0 ||
      !t.category
    ) {
      continue;
    }
    const magnitude = -t.amount;
    total.set(t.category, round2((total.get(t.category) ?? 0) + magnitude));
    const m = mapGet(byMonth, monthKey(t.date), () => new Map<string, number>());
    m.set(t.category, round2((m.get(t.category) ?? 0) + magnitude));
  }

  const ranked = [...total.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  const top = ranked.slice(0, topN);
  const folded = ranked.length > topN;
  const categories = folded ? [...top, "Other"] : top;
  const topSet = new Set(top);

  const rows = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, cats]) => {
      const row: Record<string, string | number> = { month };
      for (const name of categories) row[name] = 0;
      for (const [name, value] of cats) {
        const key = topSet.has(name) ? name : "Other";
        row[key] = round2((row[key] as number) + value);
      }
      return row;
    });

  return { rows, categories };
}

export interface ImportBatch {
  /** The shared `importedAt` timestamp of the rows added in one import. */
  importedAt: string;
  count: number;
  /** Transaction-date span of the batch. */
  minDate: string;
  maxDate: string;
}

/**
 * Distinct import batches (rows sharing an `importedAt`), newest first. Netted
 * transfers are ignored — they never reach the review anyway.
 */
export function listImportBatches(
  transactions: StoredTransaction[],
): ImportBatch[] {
  const byStamp = new Map<string, ImportBatch>();
  for (const t of transactions) {
    if (!isBudgetRelevant(t)) continue;
    const b = mapGet(byStamp, t.importedAt, () => ({
      importedAt: t.importedAt,
      count: 0,
      minDate: t.date,
      maxDate: t.date,
    }));
    b.count += 1;
    if (t.date < b.minDate) b.minDate = t.date;
    if (t.date > b.maxDate) b.maxDate = t.date;
  }
  return [...byStamp.values()].sort((a, b) =>
    b.importedAt.localeCompare(a.importedAt),
  );
}

/** The newest import batch's id, or `null` when there are no rows. */
export function latestBatchId(
  transactions: StoredTransaction[],
): string | null {
  return listImportBatches(transactions)[0]?.importedAt ?? null;
}

/**
 * Build the id -> categorization map from stored rows (categorized -> the pair,
 * skipped -> `null`, anything else -> absent). Shared by the Work flow and the
 * Analysis view.
 */
export function categorizationsFromStored(
  transactions: StoredTransaction[],
): CategorizationMap {
  const map: CategorizationMap = {};
  for (const t of transactions) {
    if (t.status === "categorized" && t.category && t.subcategory) {
      map[t.id] = { category: t.category, subcategory: t.subcategory };
    } else if (t.status === "skipped") {
      map[t.id] = null;
    }
  }
  return map;
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
