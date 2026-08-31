import assert from "node:assert/strict";
import { test } from "node:test";
import type { Flag } from "../db/flags.ts";
import type { Claim, ClaimStatus } from "../db/reimbursements.ts";
import type { StoredTransaction } from "../db/transactions.ts";
import {
  budgetDeck,
  buildReviewSummary,
  categorizationsFromStored,
  collectFollowUps,
  collectReimbursements,
  filterByPeriod,
  latestBatchId,
  listImportBatches,
  listMonths,
  monthKey,
  monthPeriod,
  monthlyExpenseByCategory,
  monthlyInOut,
  perMonthTotals,
  periodTotals,
  previousMonth,
} from "./summary.ts";
import type { CategorizationMap } from "./summary.ts";
import type { ReconciledTransaction, TransferState } from "./types.ts";

let seq = 0;
function txn(
  partial: Partial<ReconciledTransaction> & Pick<ReconciledTransaction, "amount">,
): ReconciledTransaction {
  seq += 1;
  const transferState: TransferState = partial.transferState ?? "none";
  return {
    id: `t${seq}`,
    date: "2026-08-10",
    description: "",
    direction: partial.amount < 0 ? "debit" : "credit",
    balance: null,
    accountId: "personal-everyday",
    group: "personal",
    transferState,
    transferPairId: null,
    counterpartyAccountId: null,
    ...partial,
  };
}

test("budgetDeck drops netted transfers but keeps everything else", () => {
  const all = [
    txn({ amount: -10 }),
    txn({ amount: -20, transferState: "netted" }),
    txn({ amount: -30, transferState: "cross_group" }),
    txn({ amount: -40, transferState: "unmatched" }),
  ];

  assert.deepEqual(
    budgetDeck(all).map((t) => t.amount),
    [-10, -30, -40],
  );
});

test("aggregates net totals per group / category / subcategory", () => {
  const a = txn({ amount: -50, group: "personal" });
  const b = txn({ amount: -30, group: "personal" });
  const c = txn({ amount: -200, group: "shared" });

  const categorizations: CategorizationMap = {
    [a.id]: { category: "Eating Out", subcategory: "Restaurant" },
    [b.id]: { category: "Eating Out", subcategory: "Cafe / Coffee" },
    [c.id]: { category: "Housing", subcategory: "Rent / Mortgage" },
  };

  const summary = buildReviewSummary([a, b, c], categorizations);

  assert.equal(summary.categorized, 3);
  assert.equal(summary.groups.length, 2);

  const personal = summary.groups.find((g) => g.group === "personal")!;
  assert.equal(personal.net, -80);
  assert.equal(personal.categories[0].category, "Eating Out");
  assert.equal(personal.categories[0].count, 2);
  assert.deepEqual(
    personal.categories[0].subcategories.map((s) => [s.subcategory, s.net]),
    [
      ["Restaurant", -50],
      ["Cafe / Coffee", -30],
    ],
  );
});

test("counts skipped and pending, and lists skipped transactions", () => {
  const a = txn({ amount: -10 });
  const b = txn({ amount: -20 });
  const c = txn({ amount: -30 });

  const summary = buildReviewSummary([a, b, c], {
    [a.id]: { category: "Groceries", subcategory: "Supermarket" },
    [b.id]: null,
  });

  assert.equal(summary.categorized, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.pending, 1);
  assert.deepEqual(
    summary.skippedTransactions.map((t) => t.id),
    [b.id],
  );
});

test("reports transfer counts alongside the categorization totals", () => {
  const summary = buildReviewSummary(
    [
      txn({ amount: -10, transferState: "netted" }),
      txn({ amount: -20, transferState: "netted" }),
      txn({ amount: -30, transferState: "cross_group" }),
    ],
    {},
  );

  assert.equal(summary.nettedExcluded, 2);
  assert.equal(summary.crossGroupKept, 1);
  assert.equal(summary.total, 1); // only the cross_group row is in the deck
});

// --- collectFollowUps -------------------------------------------------------

let flagSeq = 0;
function flag(partial: Partial<Flag> & Pick<Flag, "kind">): Flag {
  flagSeq += 1;
  const status = partial.status ?? "open";
  return {
    id: `f${flagSeq}`,
    txnId: "t?",
    data: partial.kind === "note" ? { text: "do a thing" } : {},
    createdAt: "2026-08-10T00:00:00.000Z",
    resolvedAt: status === "resolved" ? "2026-08-11T00:00:00.000Z" : null,
    status,
    ...partial,
  };
}

function stored(
  partial: Partial<StoredTransaction> & Pick<StoredTransaction, "amount">,
): StoredTransaction {
  return {
    ...txn(partial),
    status: "pending",
    category: null,
    subcategory: null,
    categorizedBy: null,
    ruleLabel: null,
    importedAt: "2026-08-01T00:00:00.000Z",
    categorizedAt: null,
    flags: [],
    claims: [],
    repaymentsFunded: [],
    ...partial,
  } as StoredTransaction;
}

let claimSeq = 0;
function claim(
  person: string,
  expected: number | null,
  status: ClaimStatus = "open",
  repaid = 0,
): Claim {
  claimSeq += 1;
  return {
    id: `c${claimSeq}`,
    txnId: "t?",
    person,
    expected,
    status,
    note: null,
    followedUpAt: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    repayments: [],
    repaid,
    outstanding: expected === null ? null : Math.round((expected - repaid) * 100) / 100,
  };
}

test("collectFollowUps buckets wrong-account and note flags, open first", () => {
  const early = stored({
    amount: -40,
    date: "2026-08-05",
    flags: [flag({ kind: "wrong_account", status: "resolved", data: { correctedByTxnId: "fix1" } })],
  });
  const late = stored({
    amount: -12,
    date: "2026-08-20",
    flags: [flag({ kind: "wrong_account", data: { shouldBeGroup: "personal" } })],
  });
  const noted = stored({
    amount: -8,
    date: "2026-08-09",
    flags: [flag({ kind: "note", data: { text: "follow up" } })],
  });
  const fix = stored({ amount: 40, id: "fix1", date: "2026-09-01" });

  const { wrongAccount, notes, correctionFor } = collectFollowUps([
    early,
    late,
    noted,
    fix,
  ]);

  // open one is listed before the resolved one
  assert.deepEqual(
    wrongAccount.map((w) => w.txn.id),
    [late.id, early.id],
  );
  assert.deepEqual(
    notes.map((n) => n.txn.id),
    [noted.id],
  );
  assert.equal(correctionFor.fix1?.[0].original.id, early.id);
});

test("collectFollowUps returns empty buckets when nothing is flagged", () => {
  const result = collectFollowUps([stored({ amount: -5 }), stored({ amount: 9 })]);
  assert.deepEqual(result.wrongAccount, []);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.correctionFor, {});
});

// --- collectReimbursements ------------------------------------------------------

test("collectReimbursements rolls claims up by person, most owed first", () => {
  const golf = stored({
    amount: -100,
    date: "2026-08-05",
    claims: [claim("Alice", 25), claim("Bob", 25), claim("Carol", 25)],
  });
  const dinner = stored({
    amount: -60,
    date: "2026-08-12",
    claims: [claim("Bob", 20), claim("Alice", 10, "settled")],
  });

  const { anyClaims, people } = collectReimbursements([golf, dinner]);

  assert.equal(anyClaims, true);
  // Bob owes 25 + 20 = 45; Alice owes 25 (the settled 10 doesn't count); Carol 25
  assert.deepEqual(
    people.map((p) => [p.person, p.openTotal]),
    [
      ["Bob", 45],
      ["Alice", 25],
      ["Carol", 25],
    ],
  );
  const alice = people.find((p) => p.person === "Alice")!;
  assert.equal(alice.claims.length, 2); // both the open and the settled one
});

test("collectReimbursements flags an unknown amount and returns empty when there are no claims", () => {
  const withTbd = stored({ amount: -30, claims: [claim("Dave", null)] });
  const { people } = collectReimbursements([withTbd]);
  assert.equal(people[0].hasUnknown, true);
  assert.equal(people[0].openTotal, 0);

  assert.deepEqual(collectReimbursements([stored({ amount: -5 })]), {
    anyClaims: false,
    people: [],
    hints: [],
  });
});

test("collectReimbursements openTotal follows outstanding, not expected", () => {
  const golf = stored({
    amount: -100,
    claims: [claim("Bob", 25, "open", 10)], // repaid 10 → outstanding 15
  });
  const { people } = collectReimbursements([golf]);
  assert.equal(people[0].openTotal, 15);
});

test("collectReimbursements hints match an unlinked credit to an open claim by amount", () => {
  const golf = stored({
    amount: -100,
    date: "2026-08-05",
    claims: [claim("Bob", 25), claim("Alice", 40)],
  });
  const bobPaid = stored({
    amount: 25,
    date: "2026-08-20",
    description: "OSKO FROM BOB",
  });
  const noise = stored({ amount: 99, description: "SALARY" });

  const { hints } = collectReimbursements([golf, bobPaid, noise]);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].credit.id, bobPaid.id);
  assert.equal(hints[0].claim.person, "Bob");
});

test("collectReimbursements ignores a credit that already funds a repayment", () => {
  const golf = stored({ amount: -100, claims: [claim("Bob", 25)] });
  const bobPaid = stored({
    amount: 25,
    description: "OSKO FROM BOB",
    repaymentsFunded: [
      {
        id: "r1",
        claimId: "x",
        txnId: "bob",
        amount: 25,
        createdAt: "2026-08-20",
      },
    ],
  });
  assert.equal(collectReimbursements([golf, bobPaid]).hints.length, 0);
});

// --- Analysis: history sliced by period ------------------------------------

function cat(
  partial: Partial<StoredTransaction> & Pick<StoredTransaction, "amount">,
): StoredTransaction {
  return stored({
    status: "categorized",
    category: partial.category ?? "Eating Out",
    subcategory: partial.subcategory ?? "Restaurant",
    categorizedBy: "manual",
    ...partial,
  });
}

test("monthKey / previousMonth / monthPeriod handle year and month rollover", () => {
  assert.equal(monthKey("2026-03-14"), "2026-03");
  assert.equal(previousMonth("2026-01"), "2025-12");
  assert.equal(previousMonth("2026-03"), "2026-02");
  assert.deepEqual(monthPeriod("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthPeriod("2024-02"), { from: "2024-02-01", to: "2024-02-29" }); // leap
  assert.deepEqual(monthPeriod("2026-12"), { from: "2026-12-01", to: "2026-12-31" });
});

test("listMonths returns sorted distinct months", () => {
  assert.deepEqual(
    listMonths([
      { date: "2026-03-02" },
      { date: "2026-01-31" },
      { date: "2026-03-28" },
      { date: "2025-12-01" },
    ]),
    ["2025-12", "2026-01", "2026-03"],
  );
});

test("filterByPeriod is inclusive on both ends and honours open ends", () => {
  const rows = [
    { date: "2026-01-31" },
    { date: "2026-02-01" },
    { date: "2026-02-28" },
    { date: "2026-03-01" },
  ];
  assert.deepEqual(
    filterByPeriod(rows, monthPeriod("2026-02")).map((r) => r.date),
    ["2026-02-01", "2026-02-28"],
  );
  assert.equal(filterByPeriod(rows, { from: "2026-02-15" }).length, 2);
  assert.equal(filterByPeriod(rows, { to: "2026-02-01" }).length, 2);
});

test("periodTotals splits income / expense / net per group, categorized only", () => {
  const rows = [
    cat({ amount: -50, group: "personal" }),
    cat({ amount: -30, group: "personal" }),
    cat({ amount: 200, group: "personal" }),
    cat({ amount: -80, group: "shared" }),
    stored({ amount: -999, group: "personal", status: "pending" }), // ignored
    cat({ amount: -12, group: "personal", transferState: "netted" }), // ignored
  ];
  assert.deepEqual(periodTotals(rows), [
    { group: "personal", income: 200, expense: -80, net: 120, count: 3 },
    { group: "shared", income: 0, expense: -80, net: -80, count: 1 },
  ]);
});

test("perMonthTotals is net per group per month, oldest first", () => {
  const rows = [
    cat({ amount: -40, group: "personal", date: "2026-01-10" }),
    cat({ amount: -60, group: "personal", date: "2026-01-20" }),
    cat({ amount: -25, group: "shared", date: "2026-01-15" }),
    cat({ amount: -30, group: "personal", date: "2026-02-05" }),
    stored({ amount: -5, date: "2026-02-06", status: "skipped" }), // ignored
  ];
  const months = perMonthTotals(rows);
  assert.deepEqual(months.map((m) => m.month), ["2026-01", "2026-02"]);
  assert.deepEqual(months[0].net, { personal: -100, shared: -25 });
  assert.equal(months[0].total, -125);
  assert.deepEqual(months[1].net, { personal: -30 });
});

test("listImportBatches groups by importedAt newest first with a date span", () => {
  const rows = [
    cat({ amount: -1, date: "2026-01-05", importedAt: "2026-01-31T09:00:00.000Z" }),
    cat({ amount: -2, date: "2026-01-20", importedAt: "2026-01-31T09:00:00.000Z" }),
    cat({ amount: -3, date: "2026-02-14", importedAt: "2026-02-28T09:00:00.000Z" }),
    cat({ amount: -4, date: "2026-02-02", transferState: "netted", importedAt: "2026-02-28T09:00:00.000Z" }),
  ];
  const batches = listImportBatches(rows);
  assert.deepEqual(batches.map((b) => b.importedAt), [
    "2026-02-28T09:00:00.000Z",
    "2026-01-31T09:00:00.000Z",
  ]);
  assert.deepEqual(batches[1], {
    importedAt: "2026-01-31T09:00:00.000Z",
    count: 2,
    minDate: "2026-01-05",
    maxDate: "2026-01-20",
  });
  assert.equal(batches[0].count, 1); // netted row excluded
  assert.equal(latestBatchId(rows), "2026-02-28T09:00:00.000Z");
  assert.equal(latestBatchId([]), null);
});

test("categorizationsFromStored maps categorized -> pair, skipped -> null", () => {
  const a = cat({ amount: -5, id: "a", category: "Food", subcategory: "Groceries" });
  const b = stored({ amount: -6, id: "b", status: "skipped" });
  const c = stored({ amount: -7, id: "c", status: "pending" });
  assert.deepEqual(categorizationsFromStored([a, b, c]), {
    a: { category: "Food", subcategory: "Groceries" },
    b: null,
  });
});

test("monthlyInOut splits income / expense / net per month for one group", () => {
  const rows = [
    cat({ amount: -40, group: "personal", date: "2026-01-10" }),
    cat({ amount: 3000, group: "personal", date: "2026-01-28" }),
    cat({ amount: -55, group: "personal", date: "2026-02-04" }),
    cat({ amount: -99, group: "shared", date: "2026-01-05" }), // other group
    stored({ amount: -5, group: "personal", date: "2026-01-11", status: "pending" }),
  ];
  assert.deepEqual(monthlyInOut(rows, "personal"), [
    { month: "2026-01", income: 3000, expense: -40, net: 2960 },
    { month: "2026-02", income: 0, expense: -55, net: -55 },
  ]);
});

test("monthlyExpenseByCategory ranks categories, folds the tail into Other, fills gaps", () => {
  const mk = (amount: number, category: string, date: string) =>
    cat({ amount, category, subcategory: "x", group: "personal", date });
  const rows = [
    mk(-100, "Rent", "2026-01-05"),
    mk(-40, "Groceries", "2026-01-10"),
    mk(-10, "Coffee", "2026-01-12"),
    mk(-5, "Parking", "2026-01-15"),
    mk(-80, "Rent", "2026-02-05"),
    mk(-30, "Groceries", "2026-02-08"),
    mk(-8, "Fuel", "2026-02-20"),
    cat({ amount: 500, category: "Income", subcategory: "x", group: "personal", date: "2026-02-01" }),
  ];
  const { rows: out, categories } = monthlyExpenseByCategory(rows, "personal", 2);
  assert.deepEqual(categories, ["Rent", "Groceries", "Other"]);
  assert.deepEqual(out, [
    { month: "2026-01", Rent: 100, Groceries: 40, Other: 15 }, // Coffee 10 + Parking 5
    { month: "2026-02", Rent: 80, Groceries: 30, Other: 8 }, // Fuel 8; income ignored
  ]);
});

test("monthlyExpenseByCategory keeps all categories when under topN and has no Other", () => {
  const { categories } = monthlyExpenseByCategory(
    [cat({ amount: -10, category: "A", group: "personal", date: "2026-01-01" })],
    "personal",
    6,
  );
  assert.deepEqual(categories, ["A"]);
});
