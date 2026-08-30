import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";

import { migrate } from "../db/schema.ts";
import {
  getTransaction,
  setCategorization,
  statusCounts,
  upsertTransactions,
} from "../db/transactions.ts";
import type { ReconciledTransaction } from "../transactions/types.ts";
import type { Rule } from "./config.ts";
import { runRulesOverPending } from "./run.ts";

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
    date: "2026-08-10",
    description: p.description ?? "",
    amount: p.amount,
    direction: p.amount < 0 ? "debit" : "credit",
    balance: null,
    accountId: "personal-everyday",
    group: "personal",
    transferState: "none",
    transferPairId: null,
    counterpartyAccountId: null,
  };
}

const RULES: Rule[] = [
  { label: "Salary", contains: "ACME PAYROLL", direction: "credit", category: "Income", subcategory: "Salary" },
  { label: "Spotify", contains: "SPOTIFY", category: "Entertainment", subcategory: "Streaming Services" },
];

test("runRulesOverPending categorizes matching pending rows", () => {
  const db = freshDb();
  upsertTransactions(
    db,
    [
      txn({ amount: 3000, description: "ACME PAYROLL" }),
      txn({ amount: -11.99, description: "SPOTIFY P1234" }),
      txn({ amount: -8, description: "COLES 0507" }),
    ],
    "now",
  );

  assert.deepEqual(runRulesOverPending(db, RULES), { matched: 2 });

  const salary = getTransaction(db, "t1")!;
  assert.equal(salary.status, "categorized");
  assert.equal(salary.category, "Income");
  assert.equal(salary.categorizedBy, "rule");
  assert.equal(salary.ruleLabel, "Salary");

  assert.equal(statusCounts(db).pending, 1); // COLES still pending
});

test("a re-run never overrides a manual categorization", () => {
  const db = freshDb();
  upsertTransactions(db, [txn({ id: "m1", amount: -11.99, description: "SPOTIFY" })], "now");
  setCategorization(db, "m1", { category: "Entertainment", subcategory: "Video Games" });

  assert.deepEqual(runRulesOverPending(db, RULES), { matched: 0 });

  const row = getTransaction(db, "m1")!;
  assert.equal(row.subcategory, "Video Games");
  assert.equal(row.categorizedBy, "manual");
});

test("no rules is a no-op", () => {
  const db = freshDb();
  upsertTransactions(db, [txn({ amount: -8, description: "ACME PAYROLL" })], "now");
  assert.deepEqual(runRulesOverPending(db, []), { matched: 0 });
});
