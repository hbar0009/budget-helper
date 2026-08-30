import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";

import {
  FlagError,
  addFlag,
  deleteAllFlags,
  deleteFlag,
  flagsByTxn,
  listFlags,
  normalizeFlagData,
  reopenFlag,
  resolveFlag,
  updateFlagData,
} from "./flags.ts";
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
    description: "GOLF CLUB",
    amount: -100,
    direction: "debit",
    balance: null,
    accountId: "shared-everyday",
    group: "shared",
    transferState: "none",
    transferPairId: null,
    counterpartyAccountId: null,
  };
  upsertTransactions(db, [t], "now");
  return id;
}

test("normalizeFlagData validates per kind", () => {
  assert.deepEqual(normalizeFlagData("note", { text: "  do it  " }), {
    text: "do it",
  });
  assert.throws(() => normalizeFlagData("note", { text: "  " }), FlagError);

  assert.deepEqual(
    normalizeFlagData("wrong_account", {
      shouldBeAccountId: " personal-everyday ",
      note: " ",
      junk: 1,
    }),
    { shouldBeAccountId: "personal-everyday" },
  );
});

test("addFlag attaches a flag and rejects an unknown transaction", () => {
  const db = freshDb();
  const id = seedTxn(db);

  const flag = addFlag(db, id, "wrong_account", { shouldBeGroup: "personal" });
  assert.equal(flag.kind, "wrong_account");
  assert.equal(flag.status, "open");
  assert.deepEqual(flag.data, { shouldBeGroup: "personal" });

  assert.throws(() => addFlag(db, "nope", "note", { text: "x" }), FlagError);
});

test("flagsByTxn groups every flag under its transaction", () => {
  const db = freshDb();
  const a = seedTxn(db);
  const b = seedTxn(db);
  addFlag(db, a, "note", { text: "one" });
  addFlag(db, a, "wrong_account", { shouldBeGroup: "personal" });
  addFlag(db, b, "note", { text: "two" });

  const map = flagsByTxn(db);
  assert.equal(map[a].length, 2);
  assert.equal(map[b].length, 1);
});

test("resolveFlag records the corrective transfer; reopenFlag clears it", () => {
  const db = freshDb();
  const id = seedTxn(db);
  const flag = addFlag(db, id, "wrong_account", { shouldBeGroup: "personal" });

  const resolved = resolveFlag(db, flag.id, { correctedByTxnId: "fix-1" })!;
  assert.equal(resolved.status, "resolved");
  assert.ok(resolved.resolvedAt);
  assert.equal(
    (resolved.data as { correctedByTxnId?: string }).correctedByTxnId,
    "fix-1",
  );

  const reopened = reopenFlag(db, flag.id)!;
  assert.equal(reopened.status, "open");
  assert.equal(reopened.resolvedAt, null);
  assert.equal(
    (reopened.data as { correctedByTxnId?: string }).correctedByTxnId,
    undefined,
  );
});

test("updateFlagData replaces the payload, keeping the kind's rules", () => {
  const db = freshDb();
  const id = seedTxn(db);
  const flag = addFlag(db, id, "note", { text: "first" });

  const edited = updateFlagData(db, flag.id, { text: "second" })!;
  assert.equal((edited.data as { text: string }).text, "second");
  assert.throws(() => updateFlagData(db, flag.id, { text: "" }), FlagError);
});

test("updateFlagData keeps a resolved wrong-account's corrective link", () => {
  const db = freshDb();
  const id = seedTxn(db);
  const flag = addFlag(db, id, "wrong_account", { note: "oops" });
  resolveFlag(db, flag.id, { correctedByTxnId: "fix-1" });

  const edited = updateFlagData(db, flag.id, { note: "reworded" })!;
  assert.equal(
    (edited.data as { correctedByTxnId?: string }).correctedByTxnId,
    "fix-1",
  );
});

test("deleteFlag and deleteAllFlags remove rows", () => {
  const db = freshDb();
  const id = seedTxn(db);
  const a = addFlag(db, id, "note", { text: "a" });
  addFlag(db, id, "note", { text: "b" });

  deleteFlag(db, a.id);
  assert.equal(listFlags(db).length, 1);

  deleteAllFlags(db);
  assert.equal(listFlags(db).length, 0);
});
