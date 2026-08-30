import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";

import {
  ClaimError,
  addClaims,
  addRepayment,
  deleteAllClaims,
  deleteAllRepayments,
  deleteClaim,
  deleteRepayment,
  claimsByTxn,
  getClaim,
  listClaims,
  listRepayments,
  normalizeClaimInput,
  normalizeRepaymentInput,
  updateClaim,
} from "./reimbursements.ts";
import { migrate } from "./schema.ts";
import { upsertTransactions } from "./transactions.ts";
import type {
  ReconciledTransaction,
  TransferState,
} from "../transactions/types.ts";

let seq = 0;
function freshDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

function seedTxn(db: Database.Database, id = `t${(seq += 1)}`): string {
  const t: ReconciledTransaction = {
    id,
    date: "2026-08-10",
    description: "GOLF CLUB — 4 players",
    amount: -100,
    direction: "debit",
    balance: null,
    accountId: "personal-everyday",
    group: "personal",
    transferState: "none",
    transferPairId: null,
    counterpartyAccountId: null,
  };
  upsertTransactions(db, [t], "now");
  return id;
}

function seedCredit(
  db: Database.Database,
  amount = 25,
  transferState: TransferState = "none",
  id = `c${(seq += 1)}`,
): string {
  upsertTransactions(
    db,
    [
      {
        id,
        date: "2026-08-20",
        description: "OSKO FROM A FRIEND",
        amount,
        direction: "credit",
        balance: null,
        accountId: "personal-everyday",
        group: "personal",
        transferState,
        transferPairId: null,
        counterpartyAccountId: null,
      },
    ],
    "now",
  );
  return id;
}

test("normalizeClaimInput trims, rounds, and validates", () => {
  assert.deepEqual(normalizeClaimInput({ person: "  Alice ", expected: 25.005 }), {
    person: "Alice",
    expected: 25.01,
    note: null,
  });
  assert.deepEqual(normalizeClaimInput({ person: "Bob" }), {
    person: "Bob",
    expected: null,
    note: null,
  });
  assert.throws(() => normalizeClaimInput({ person: " " }), ClaimError);
  assert.throws(
    () => normalizeClaimInput({ person: "Bob", expected: -1 }),
    ClaimError,
  );
});

test("addClaims inserts one row per person and rejects an unknown txn", () => {
  const db = freshDb();
  const id = seedTxn(db);

  const claims = addClaims(db, id, [
    { person: "Alice", expected: 25 },
    { person: "Bob", expected: 25 },
    { person: "Carol" }, // amount TBD
  ]);

  assert.equal(claims.length, 3);
  assert.equal(claims[0].status, "open");
  assert.equal(claims[2].expected, null);
  assert.equal(listClaims(db).length, 3);

  assert.throws(() => addClaims(db, "nope", [{ person: "X" }]), ClaimError);
  assert.throws(() => addClaims(db, id, []), ClaimError);
});

test("claimsByTxn groups claims under their transaction", () => {
  const db = freshDb();
  const a = seedTxn(db);
  const b = seedTxn(db);
  addClaims(db, a, [{ person: "Alice" }, { person: "Bob" }]);
  addClaims(db, b, [{ person: "Carol" }]);

  const map = claimsByTxn(db);
  assert.equal(map[a].length, 2);
  assert.equal(map[b].length, 1);
});

test("updateClaim edits the split, status, and followed-up marker", () => {
  const db = freshDb();
  const id = seedTxn(db);
  const [claim] = addClaims(db, id, [{ person: "Alice", expected: 25 }]);

  const renamed = updateClaim(db, claim.id, { person: "Alice B", expected: 30 })!;
  assert.equal(renamed.person, "Alice B");
  assert.equal(renamed.expected, 30);

  const chased = updateClaim(db, claim.id, { followedUp: true })!;
  assert.ok(chased.followedUpAt);
  assert.equal(updateClaim(db, claim.id, { followedUp: false })!.followedUpAt, null);

  const settled = updateClaim(db, claim.id, { status: "settled" })!;
  assert.equal(settled.status, "settled");
  assert.throws(
    () => updateClaim(db, claim.id, { status: "bogus" }),
    ClaimError,
  );
});

test("deleteClaim and deleteAllClaims remove rows", () => {
  const db = freshDb();
  const id = seedTxn(db);
  const [a] = addClaims(db, id, [{ person: "Alice" }, { person: "Bob" }]);

  deleteClaim(db, a.id);
  assert.equal(listClaims(db).length, 1);

  deleteAllClaims(db);
  assert.equal(listClaims(db).length, 0);
  assert.equal(getClaim(db, a.id), undefined);
});

// --- repayments (Part B) ---------------------------------------------------

test("normalizeRepaymentInput validates amount and trims txnId", () => {
  assert.deepEqual(normalizeRepaymentInput({ amount: 10.005, txnId: " c1 " }), {
    amount: 10.01,
    txnId: "c1",
  });
  assert.deepEqual(normalizeRepaymentInput({ amount: 5 }), {
    amount: 5,
    txnId: null,
  });
  assert.throws(() => normalizeRepaymentInput({ amount: 0 }), ClaimError);
  assert.throws(() => normalizeRepaymentInput({ amount: -1 }), ClaimError);
});

test("addRepayment lowers outstanding and fills repayments", () => {
  const db = freshDb();
  const debit = seedTxn(db);
  const credit = seedCredit(db, 25);
  const [claim] = addClaims(db, debit, [{ person: "Bob", expected: 40 }]);

  const after = addRepayment(db, claim.id, { txnId: credit, amount: 25 });
  assert.equal(after.repaid, 25);
  assert.equal(after.outstanding, 15);
  assert.equal(after.status, "open");
  assert.equal(after.repayments.length, 1);
  assert.equal(after.repayments[0].txnId, credit);
});

test("addRepayment auto-settles a claim once fully repaid", () => {
  const db = freshDb();
  const debit = seedTxn(db);
  const [claim] = addClaims(db, debit, [{ person: "Bob", expected: 25 }]);

  const cash = addRepayment(db, claim.id, { amount: 25, txnId: null });
  assert.equal(cash.status, "settled");
  assert.equal(cash.outstanding, 0);
  assert.equal(cash.repayments[0].txnId, null);
});

test("addRepayment rejects a non-credit funding transaction", () => {
  const db = freshDb();
  const debit = seedTxn(db);
  const transfer = seedCredit(db, 25, "cross_group");
  const [claim] = addClaims(db, debit, [{ person: "Bob", expected: 25 }]);

  assert.throws(
    () => addRepayment(db, claim.id, { txnId: debit, amount: 10 }),
    ClaimError,
  );
  assert.throws(
    () => addRepayment(db, claim.id, { txnId: transfer, amount: 10 }),
    ClaimError,
  );
  assert.throws(
    () => addRepayment(db, "nope", { amount: 10, txnId: null }),
    ClaimError,
  );
});

test("deleteRepayment lowers repaid but does not reopen a settled claim", () => {
  const db = freshDb();
  const debit = seedTxn(db);
  const [claim] = addClaims(db, debit, [{ person: "Bob", expected: 25 }]);
  const settled = addRepayment(db, claim.id, { amount: 25, txnId: null });
  assert.equal(settled.status, "settled");

  const back = deleteRepayment(db, settled.repayments[0].id)!;
  assert.equal(back.repaid, 0);
  assert.equal(back.status, "settled"); // stays settled — reopen by hand
  assert.equal(listRepayments(db).length, 0);
});

test("deleteAllRepayments clears the table", () => {
  const db = freshDb();
  const debit = seedTxn(db);
  const [claim] = addClaims(db, debit, [{ person: "Bob", expected: 25 }]);
  addRepayment(db, claim.id, { amount: 10, txnId: null });

  deleteAllRepayments(db);
  assert.equal(listRepayments(db).length, 0);
  assert.equal(getClaim(db, claim.id)!.repaid, 0);
});
