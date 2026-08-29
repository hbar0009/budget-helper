import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";

import { migrate } from "./schema.ts";
import {
  deleteAllTransactions,
  getTransaction,
  listTransactions,
  setCategorization,
  statusCounts,
  upsertTransactions,
} from "./transactions.ts";
import type { ReconciledTransaction } from "../transactions/types.ts";

function freshDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

let seq = 0;
function txn(
  p: Partial<ReconciledTransaction> & Pick<ReconciledTransaction, "amount">,
): ReconciledTransaction {
  seq += 1;
  return {
    id: p.id ?? `t${seq}`,
    date: p.date ?? "2026-08-10",
    description: p.description ?? "Test row",
    amount: p.amount,
    direction: p.amount < 0 ? "debit" : "credit",
    balance: p.balance ?? null,
    accountId: p.accountId ?? "personal-everyday",
    group: p.group ?? "personal",
    transferState: p.transferState ?? "none",
    transferPairId: p.transferPairId ?? null,
    counterpartyAccountId: p.counterpartyAccountId ?? null,
  };
}

test("upsert inserts new rows and ignores duplicate ids", () => {
  const db = freshDb();
  const a = txn({ amount: -10 });

  assert.deepEqual(upsertTransactions(db, [a, txn({ amount: -20 })], "now"), {
    inserted: 2,
    alreadyPresent: 0,
  });
  assert.deepEqual(upsertTransactions(db, [a], "later"), {
    inserted: 0,
    alreadyPresent: 1,
  });
  assert.equal(listTransactions(db).length, 2);
});

test("netted transfers are stored as excluded, others as pending", () => {
  const db = freshDb();
  upsertTransactions(
    db,
    [txn({ amount: -10, transferState: "netted" }), txn({ amount: -20 })],
    "now",
  );

  assert.equal(statusCounts(db).excluded, 1);
  assert.equal(statusCounts(db).pending, 1);
});

test("re-import does not overwrite an existing categorization", () => {
  const db = freshDb();
  const a = txn({ amount: -10 });
  upsertTransactions(db, [a], "now");
  setCategorization(db, a.id, { category: "Groceries", subcategory: "Supermarket" });

  upsertTransactions(db, [a], "later");

  const stored = getTransaction(db, a.id)!;
  assert.equal(stored.status, "categorized");
  assert.equal(stored.category, "Groceries");
});

test("setCategorization sets fields; skip clears them", () => {
  const db = freshDb();
  const a = txn({ amount: -5 });
  upsertTransactions(db, [a], "now");

  const categorized = setCategorization(db, a.id, {
    category: "Eating Out",
    subcategory: "Cafe / Coffee",
  })!;
  assert.equal(categorized.status, "categorized");
  assert.equal(categorized.subcategory, "Cafe / Coffee");
  assert.ok(categorized.categorizedAt);

  const skipped = setCategorization(db, a.id, null)!;
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.category, null);
  assert.equal(skipped.subcategory, null);
});

test("setCategorization returns undefined for an unknown id", () => {
  const db = freshDb();
  assert.equal(
    setCategorization(db, "nope", { category: "x", subcategory: "y" }),
    undefined,
  );
});

test("listTransactions returns rows oldest first", () => {
  const db = freshDb();
  upsertTransactions(
    db,
    [
      txn({ amount: -1, date: "2026-08-20" }),
      txn({ amount: -2, date: "2026-08-05" }),
      txn({ amount: -3, date: "2026-08-12" }),
    ],
    "now",
  );

  assert.deepEqual(
    listTransactions(db).map((t) => t.date),
    ["2026-08-05", "2026-08-12", "2026-08-20"],
  );
});

test("listTransactions filters by status", () => {
  const db = freshDb();
  const a = txn({ amount: -1 });
  upsertTransactions(db, [a, txn({ amount: -2 }), txn({ amount: -3 })], "now");
  setCategorization(db, a.id, { category: "X", subcategory: "Y" });

  assert.equal(listTransactions(db, { status: "pending" }).length, 2);
  assert.equal(listTransactions(db, { status: "categorized" }).length, 1);
});

test("deleteAllTransactions empties the table", () => {
  const db = freshDb();
  upsertTransactions(db, [txn({ amount: -1 })], "now");
  deleteAllTransactions(db);
  assert.equal(listTransactions(db).length, 0);
});

test("round-trips every reconciled field", () => {
  const db = freshDb();
  const a = txn({
    amount: -12.5,
    balance: 100.25,
    date: "2026-07-01",
    group: "shared",
    transferState: "cross_group",
    transferPairId: "pair-1",
    counterpartyAccountId: "personal-everyday",
  });
  upsertTransactions(db, [a], "2026-08-01T10:00:00.000Z");

  const s = getTransaction(db, a.id)!;
  assert.equal(s.amount, -12.5);
  assert.equal(s.balance, 100.25);
  assert.equal(s.direction, "debit");
  assert.equal(s.group, "shared");
  assert.equal(s.transferState, "cross_group");
  assert.equal(s.transferPairId, "pair-1");
  assert.equal(s.counterpartyAccountId, "personal-everyday");
  assert.equal(s.importedAt, "2026-08-01T10:00:00.000Z");
  assert.equal(s.status, "pending");
  assert.equal(s.categorizedAt, null);
});
