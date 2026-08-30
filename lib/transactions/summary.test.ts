import assert from "node:assert/strict";
import { test } from "node:test";
import type { Flag } from "../db/flags.ts";
import type { StoredTransaction } from "../db/transactions.ts";
import { budgetDeck, buildReviewSummary, collectFollowUps } from "./summary.ts";
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
    ...partial,
  } as StoredTransaction;
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
