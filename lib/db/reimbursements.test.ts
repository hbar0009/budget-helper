import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";

import {
  ClaimError,
  addClaims,
  deleteAllClaims,
  deleteClaim,
  claimsByTxn,
  getClaim,
  listClaims,
  normalizeClaimInput,
  updateClaim,
} from "./reimbursements.ts";
import { migrate } from "./schema.ts";
import { upsertTransactions } from "./transactions.ts";
import type { ReconciledTransaction } from "../transactions/types.ts";

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
