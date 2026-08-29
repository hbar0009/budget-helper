import assert from "node:assert/strict";
import { test } from "node:test";
import type { Account } from "../accounts/config.ts";
import { reconcileTransfers } from "./reconcile.ts";
import type { AccountTransaction } from "./types.ts";

const ACCOUNTS: Account[] = [
  { id: "p-everyday", label: "Personal Everyday", number: "1000000001", type: "everyday", group: "personal" },
  { id: "p-savings", label: "Personal Savings", number: "1000000002", type: "savings", group: "personal" },
  { id: "s-everyday", label: "Shared Everyday", number: "2000000001", type: "everyday", group: "shared" },
];

let seq = 0;
function txn(
  partial: Partial<AccountTransaction> &
    Pick<AccountTransaction, "accountId" | "amount">,
): AccountTransaction {
  const account = ACCOUNTS.find((a) => a.id === partial.accountId)!;
  seq += 1;
  return {
    id: `t${seq}`,
    date: "2026-08-10",
    description: "",
    balance: null,
    direction: partial.amount < 0 ? "debit" : "credit",
    group: account.group,
    ...partial,
  };
}

test("nets out a matched transfer within the same group", () => {
  const { transactions, summary } = reconcileTransfers(
    [
      txn({ accountId: "p-everyday", amount: -100, description: "Internal Transfer - Receipt 1 Personal Savings 1000000002" }),
      txn({ accountId: "p-savings", amount: 100, description: "Internal Transfer - Receipt 1 Personal Everyday 1000000001" }),
    ],
    ACCOUNTS,
  );

  assert.equal(summary.nettedPairs, 1);
  assert.equal(summary.crossGroupPairs, 0);
  assert.ok(transactions.every((t) => t.transferState === "netted"));
  assert.ok(transactions[0].transferPairId);
  assert.equal(transactions[0].transferPairId, transactions[1].transferPairId);
});

test("keeps a matched transfer that crosses groups", () => {
  const { transactions, summary } = reconcileTransfers(
    [
      txn({ accountId: "p-everyday", amount: -250, description: "Internal Transfer to Shared Everyday 2000000001" }),
      txn({ accountId: "s-everyday", amount: 250, description: "Internal Transfer from Personal Everyday 1000000001" }),
    ],
    ACCOUNTS,
  );

  assert.equal(summary.nettedPairs, 0);
  assert.equal(summary.crossGroupPairs, 1);
  assert.ok(transactions.every((t) => t.transferState === "cross_group"));
  assert.equal(transactions[0].transferPairId, transactions[1].transferPairId);
});

test("flags a transfer with no counterpart in the batch as unmatched", () => {
  const { transactions, summary } = reconcileTransfers(
    [
      txn({ accountId: "p-everyday", amount: -75, description: "Internal Transfer - Receipt 9 Personal Savings 1000000002" }),
    ],
    ACCOUNTS,
  );

  assert.equal(summary.unmatched, 1);
  assert.equal(transactions[0].transferState, "unmatched");
  assert.equal(transactions[0].transferPairId, null);
  assert.equal(transactions[0].counterpartyAccountId, "p-savings");
});

test("leaves ordinary spending and income untouched", () => {
  const { transactions, summary } = reconcileTransfers(
    [
      txn({ accountId: "p-everyday", amount: -12.5, description: "COLES 0507 GLEN IRIS" }),
      txn({ accountId: "p-everyday", amount: 2000, description: "ACME PTY LTD PAYROLL" }),
    ],
    ACCOUNTS,
  );

  assert.deepEqual(summary, { nettedPairs: 0, crossGroupPairs: 0, unmatched: 0 });
  assert.ok(transactions.every((t) => t.transferState === "none"));
});

test("does not pair equal-and-opposite amounts that are not transfers", () => {
  const { summary } = reconcileTransfers(
    [
      txn({ accountId: "p-everyday", amount: -40, description: "BUNNINGS WAREHOUSE" }),
      txn({ accountId: "p-savings", amount: 40, description: "REFUND BUNNINGS WAREHOUSE" }),
    ],
    ACCOUNTS,
  );

  assert.deepEqual(summary, { nettedPairs: 0, crossGroupPairs: 0, unmatched: 0 });
});

test("does not pair two legs in the same account", () => {
  const { summary } = reconcileTransfers(
    [
      txn({ accountId: "p-everyday", amount: -60, description: "Internal Transfer Personal Savings 1000000002" }),
      txn({ accountId: "p-everyday", amount: 60, description: "Internal Transfer Personal Savings 1000000002" }),
    ],
    ACCOUNTS,
  );

  assert.equal(summary.nettedPairs, 0);
  assert.equal(summary.unmatched, 2);
});

test("respects the maxDaysApart window", () => {
  const legs: AccountTransaction[] = [
    txn({ accountId: "p-everyday", amount: -500, date: "2026-08-10", description: "Internal Transfer Personal Savings 1000000002" }),
    txn({ accountId: "p-savings", amount: 500, date: "2026-08-13", description: "Internal Transfer Personal Everyday 1000000001" }),
  ];

  assert.equal(reconcileTransfers(legs, ACCOUNTS).summary.unmatched, 2);
  assert.equal(
    reconcileTransfers(legs, ACCOUNTS, { maxDaysApart: 5 }).summary.nettedPairs,
    1,
  );
});

test("matches when only one leg names the counterparty account number", () => {
  const { summary } = reconcileTransfers(
    [
      txn({ accountId: "p-everyday", amount: -30, description: "Internal Transfer - Receipt 5 Personal Savings 1000000002" }),
      txn({ accountId: "p-savings", amount: 30, description: "Internal Transfer - Receipt 5" }),
    ],
    ACCOUNTS,
  );

  assert.equal(summary.nettedPairs, 1);
});

test("matches a correction leg that only says 'transfer' when the other leg is clean", () => {
  // Real case: one leg misnames the counterparty and never says "internal
  // transfer", but the other leg identifies it by number and both share a receipt.
  const { transactions, summary } = reconcileTransfers(
    [
      txn({ accountId: "p-savings", amount: -34, description: "Fix for another incorrect transfer - Receipt 9488 - To Orange Everyday" }),
      txn({ accountId: "s-everyday", amount: 34, description: "Fix for another incorrect transfer - Internal Transfer - Receipt 9488 Savings Maximiser 1000000002" }),
    ],
    ACCOUNTS,
  );

  assert.equal(summary.crossGroupPairs, 1);
  assert.equal(summary.unmatched, 0);
  assert.ok(transactions.every((t) => t.transferState === "cross_group"));
  assert.equal(transactions[0].transferPairId, transactions[1].transferPairId);
});

test("a shared receipt number overrides a misnamed counterparty", () => {
  const { summary } = reconcileTransfers(
    [
      // names p-everyday's number, but the real other leg is in s-everyday
      txn({ accountId: "p-savings", amount: -20, description: "Correction - Receipt 5511 - To Orange Everyday 1000000001" }),
      txn({ accountId: "s-everyday", amount: 20, description: "Correction - Internal Transfer - Receipt 5511 Savings Maximiser 1000000002" }),
    ],
    ACCOUNTS,
  );

  assert.equal(summary.crossGroupPairs, 1);
});

test("an unpaired row that merely contains 'transfer' stays 'none', not 'unmatched'", () => {
  const { transactions, summary } = reconcileTransfers(
    [
      txn({ accountId: "p-everyday", amount: -50, description: "Wise transfer to a contractor" }),
      txn({ accountId: "s-everyday", amount: 50, description: "Refund transfer from a client" }),
    ],
    ACCOUNTS,
  );

  assert.deepEqual(summary, { nettedPairs: 0, crossGroupPairs: 0, unmatched: 0 });
  assert.ok(transactions.every((t) => t.transferState === "none"));
});
