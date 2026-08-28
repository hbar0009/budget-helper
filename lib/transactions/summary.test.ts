import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetDeck, buildReviewSummary } from "./summary.ts";
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
