import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReconciledTransaction } from "../transactions/types.ts";
import { applyRules } from "./apply.ts";
import type { Rule } from "./config.ts";

let seq = 0;
function txn(
  p: Partial<ReconciledTransaction> & Pick<ReconciledTransaction, "amount">,
): ReconciledTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    date: "2026-08-10",
    description: p.description ?? "",
    amount: p.amount,
    direction: p.amount < 0 ? "debit" : "credit",
    balance: null,
    accountId: p.accountId ?? "personal-everyday",
    group: p.group ?? "personal",
    transferState: p.transferState ?? "none",
    transferPairId: null,
    counterpartyAccountId: null,
  };
}

test("matches by case-insensitive substring", () => {
  const matches = applyRules(
    [txn({ amount: 3000, description: "ACME PAYROLL PTY LTD" })],
    [{ label: "Salary", contains: "acme payroll", category: "Income", subcategory: "Salary" }],
  );
  assert.equal(matches.length, 1);
  assert.deepEqual(
    { cat: matches[0].category, sub: matches[0].subcategory, label: matches[0].label },
    { cat: "Income", sub: "Salary", label: "Salary" },
  );
});

test("matches by regex", () => {
  const matches = applyRules(
    [txn({ amount: -1800, description: "RENT PAYMENT SMITH PROPERTY GROUP" })],
    [{ regex: "RENT.*PROPERTY", category: "Housing", subcategory: "Rent" }],
  );
  assert.equal(matches.length, 1);
});

test("first matching rule wins", () => {
  const rules: Rule[] = [
    { label: "Specific", contains: "UBER EATS", category: "Eating Out", subcategory: "Takeaway" },
    { label: "Generic", contains: "UBER", category: "Transport", subcategory: "Rideshare" },
  ];
  const matches = applyRules([txn({ amount: -25, description: "UBER EATS SYDNEY" })], rules);
  assert.equal(matches[0].label, "Specific");
});

test("narrows by direction, account, and absolute amount", () => {
  const rule: Rule = {
    contains: "transfer",
    direction: "debit",
    account: "personal-everyday",
    minAmount: 100,
    maxAmount: 500,
    category: "Shared Account",
    subcategory: "Shared Account",
  };

  assert.equal(applyRules([txn({ amount: -250, description: "internal transfer", accountId: "personal-everyday" })], [rule]).length, 1);
  // wrong direction
  assert.equal(applyRules([txn({ amount: 250, description: "internal transfer", accountId: "personal-everyday" })], [rule]).length, 0);
  // wrong account
  assert.equal(applyRules([txn({ amount: -250, description: "internal transfer", accountId: "personal-savings" })], [rule]).length, 0);
  // outside amount band
  assert.equal(applyRules([txn({ amount: -50, description: "internal transfer", accountId: "personal-everyday" })], [rule]).length, 0);
});

test("never matches a netted transfer", () => {
  const matches = applyRules(
    [txn({ amount: -100, description: "SPOTIFY", transferState: "netted" })],
    [{ contains: "SPOTIFY", category: "Entertainment", subcategory: "Streaming Services" }],
  );
  assert.equal(matches.length, 0);
});

test("returns nothing when no rule matches", () => {
  const matches = applyRules(
    [txn({ amount: -12.5, description: "COLES GLEN IRIS" })],
    [{ contains: "WOOLWORTHS", category: "Groceries", subcategory: "Supermarket" }],
  );
  assert.equal(matches.length, 0);
});
