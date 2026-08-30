import assert from "node:assert/strict";
import { test } from "node:test";

import type { Account } from "../accounts/config.ts";
import type { Claim } from "../db/reimbursements.ts";
import type { StoredTransaction } from "../db/transactions.ts";
import { buildSinkRowsByGroup, isSinkable } from "./rows.ts";

const ACCOUNTS: Account[] = [
  { id: "personal-everyday", label: "Personal Everyday", number: "1", type: "everyday", group: "personal" },
  { id: "shared-everyday", label: "Shared Everyday", number: "2", type: "everyday", group: "shared" },
];

let seq = 0;
function stored(p: Partial<StoredTransaction> & Pick<StoredTransaction, "amount">): StoredTransaction {
  seq += 1;
  return {
    id: p.id ?? `t${seq}`,
    date: p.date ?? "2026-08-10",
    description: p.description ?? "Row",
    amount: p.amount,
    direction: p.amount < 0 ? "debit" : "credit",
    balance: null,
    accountId: p.accountId ?? "personal-everyday",
    group: p.group ?? "personal",
    transferState: p.transferState ?? "none",
    transferPairId: null,
    counterpartyAccountId: null,
    status: p.status ?? "categorized",
    category: p.category ?? "Eating Out",
    subcategory: p.subcategory ?? "Restaurant",
    categorizedBy: "manual",
    ruleLabel: null,
    importedAt: "now",
    categorizedAt: "now",
    flags: [],
    claims: p.claims ?? [],
    repaymentsFunded: p.repaymentsFunded ?? [],
  };
}

function claim(p: Partial<Claim>): Claim {
  const expected = p.expected ?? null;
  const repaid = p.repaid ?? 0;
  return {
    id: p.id ?? "c1",
    txnId: p.txnId ?? "t1",
    person: p.person ?? "Alice",
    expected,
    status: p.status ?? "open",
    note: null,
    followedUpAt: null,
    createdAt: "now",
    repayments: [],
    repaid,
    outstanding: expected === null ? null : Math.round((expected - repaid) * 100) / 100,
  };
}

test("isSinkable keeps only categorized, budget-relevant, non-repayment rows", () => {
  assert.equal(isSinkable(stored({ amount: -10 })), true);
  assert.equal(isSinkable(stored({ amount: -10, status: "pending" })), false);
  assert.equal(isSinkable(stored({ amount: -10, status: "skipped" })), false);
  assert.equal(
    isSinkable(stored({ amount: -10, transferState: "netted" })),
    false,
  );
  assert.equal(
    isSinkable(
      stored({
        amount: 25,
        repaymentsFunded: [
          { id: "r1", claimId: "c1", txnId: "t1", amount: 25, createdAt: "now" },
        ],
      }),
    ),
    false,
  );
});

test("a plain transaction maps straight through, gross == net", () => {
  const rows = buildSinkRowsByGroup([stored({ id: "t1", amount: -42.5 })], ACCOUNTS);
  assert.deepEqual(rows.personal[0], {
    id: "t1",
    date: "2026-08-10",
    description: "Row",
    account: "Personal Everyday",
    category: "Eating Out",
    subcategory: "Restaurant",
    gross: -42.5,
    reimbursed: 0,
    net: -42.5,
    reimbStatus: "",
    owedBy: "",
  });
});

test("a fronted debit nets out what has actually been repaid", () => {
  const t = stored({
    id: "golf",
    amount: -100,
    claims: [
      claim({ id: "a", person: "Alice", expected: 40, repaid: 40, status: "settled" }),
      claim({ id: "b", person: "Bob", expected: 25, repaid: 10 }),
    ],
  });
  const [row] = buildSinkRowsByGroup([t], ACCOUNTS).personal;
  assert.equal(row.gross, -100);
  assert.equal(row.reimbursed, 50); // 40 + 10 received so far
  assert.equal(row.net, -50);
  assert.equal(row.reimbStatus, "partial");
  assert.equal(row.owedBy, "Alice, Bob");
});

test("reimbStatus is 'open' before any repayment and 'settled' when all claims are", () => {
  const open = buildSinkRowsByGroup(
    [stored({ amount: -30, claims: [claim({ expected: 15 })] })],
    ACCOUNTS,
  ).personal[0];
  assert.equal(open.reimbStatus, "open");
  assert.equal(open.net, -30);

  const done = buildSinkRowsByGroup(
    [
      stored({
        amount: -30,
        claims: [claim({ expected: 15, repaid: 15, status: "settled" })],
      }),
    ],
    ACCOUNTS,
  ).personal[0];
  assert.equal(done.reimbStatus, "settled");
});

test("rows are split by group and sorted by date then id", () => {
  const rows = buildSinkRowsByGroup(
    [
      stored({ id: "b", date: "2026-08-12", amount: -1, group: "personal" }),
      stored({ id: "a", date: "2026-08-12", amount: -2, group: "personal" }),
      stored({ id: "c", date: "2026-08-01", amount: -3, group: "personal" }),
      stored({ id: "s", amount: -4, group: "shared", accountId: "shared-everyday" }),
    ],
    ACCOUNTS,
  );
  assert.deepEqual(rows.personal.map((r) => r.id), ["c", "a", "b"]);
  assert.equal(rows.shared.length, 1);
  assert.equal(rows.shared[0].account, "Shared Everyday");
});
