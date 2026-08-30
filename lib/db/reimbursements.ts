/**
 * Queries over the `reimbursement_claim` table — "person P owes me `expected`
 * for transaction T". One fronted debit spawns one claim per person.
 *
 * Part A (this module) tracks who owes what and lets you settle / write off by
 * hand. Linking the actual incoming repayment credit is a later addition.
 *
 * Every function takes an explicit `db` so it can be unit-tested against an
 * in-memory database (see `reimbursements.test.ts`).
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type ClaimStatus = "open" | "settled" | "written_off";

const STATUSES: ClaimStatus[] = ["open", "settled", "written_off"];

export interface Claim {
  id: string;
  txnId: string;
  person: string;
  /** What they owe. `null` = amount not known yet. */
  expected: number | null;
  status: ClaimStatus;
  note: string | null;
  /** ISO timestamp of when you last chased them, or `null`. */
  followedUpAt: string | null;
  createdAt: string;
}

export interface ClaimInput {
  person: string;
  expected?: number | null;
  note?: string | null;
}

export class ClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimError";
  }
}

interface Row {
  id: string;
  txn_id: string;
  person: string;
  expected: number | null;
  status: string;
  note: string | null;
  followed_up_at: string | null;
  created_at: string;
}

function toClaim(row: Row): Claim {
  return {
    id: row.id,
    txnId: row.txn_id,
    person: row.person,
    expected: row.expected,
    status: row.status as ClaimStatus,
    note: row.note,
    followedUpAt: row.followed_up_at,
    createdAt: row.created_at,
  };
}

export function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

/** Validate + trim one claim's input. Pure; throws `ClaimError`. */
export function normalizeClaimInput(input: unknown): Required<ClaimInput> {
  const d = (input ?? {}) as Record<string, unknown>;
  const person = typeof d.person === "string" ? d.person.trim() : "";
  if (!person) throw new ClaimError("Each split needs a person.");

  let expected: number | null = null;
  if (d.expected !== null && d.expected !== undefined) {
    const n = typeof d.expected === "number" ? d.expected : Number(d.expected);
    if (!Number.isFinite(n) || n < 0) {
      throw new ClaimError(`"${person}" has an invalid amount.`);
    }
    expected = Math.round(n * 100) / 100;
  }

  const note =
    typeof d.note === "string" && d.note.trim() ? d.note.trim() : null;

  return { person, expected, note };
}

export function listClaims(db: Database.Database): Claim[] {
  const rows = db
    .prepare(`SELECT * FROM reimbursement_claim ORDER BY created_at, id`)
    .all();
  return (rows as Row[]).map(toClaim);
}

/** Transaction id → its claims, for the `GET /api/transactions` join. */
export function claimsByTxn(db: Database.Database): Record<string, Claim[]> {
  const out: Record<string, Claim[]> = {};
  for (const claim of listClaims(db)) (out[claim.txnId] ??= []).push(claim);
  return out;
}

export function claimsForTxn(db: Database.Database, txnId: string): Claim[] {
  const rows = db
    .prepare(
      `SELECT * FROM reimbursement_claim WHERE txn_id = ? ORDER BY created_at, id`,
    )
    .all(txnId);
  return (rows as Row[]).map(toClaim);
}

export function getClaim(db: Database.Database, id: string): Claim | undefined {
  const row = db
    .prepare(`SELECT * FROM reimbursement_claim WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? toClaim(row) : undefined;
}

/** Add one or more claims to a fronted debit. */
export function addClaims(
  db: Database.Database,
  txnId: string,
  inputs: unknown[],
): Claim[] {
  const exists = db
    .prepare(`SELECT 1 FROM transactions WHERE id = ?`)
    .get(txnId);
  if (!exists) throw new ClaimError("Unknown transaction.");
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new ClaimError("Add at least one person.");
  }

  const clean = inputs.map(normalizeClaimInput);
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO reimbursement_claim (id, txn_id, person, expected, note, status, created_at)
     VALUES (@id, @txnId, @person, @expected, @note, 'open', @now)`,
  );

  const ids: string[] = [];
  const insertAll = db.transaction((rows: Required<ClaimInput>[]) => {
    for (const row of rows) {
      const id = randomUUID();
      ids.push(id);
      stmt.run({ id, txnId, person: row.person, expected: row.expected, note: row.note, now });
    }
  });
  insertAll(clean);

  return ids.map((id) => getClaim(db, id)!);
}

export function updateClaim(
  db: Database.Database,
  id: string,
  patch: {
    person?: unknown;
    expected?: unknown;
    note?: unknown;
    status?: unknown;
    followedUp?: unknown;
  },
): Claim | undefined {
  const current = getClaim(db, id);
  if (!current) return undefined;

  let { person, expected, note } = current;
  if ("person" in patch || "expected" in patch || "note" in patch) {
    const merged = normalizeClaimInput({
      person: "person" in patch ? patch.person : current.person,
      expected: "expected" in patch ? patch.expected : current.expected,
      note: "note" in patch ? patch.note : current.note,
    });
    person = merged.person;
    expected = merged.expected;
    note = merged.note;
  }

  let status = current.status;
  if (patch.status !== undefined) {
    if (!isClaimStatus(patch.status)) {
      throw new ClaimError("Invalid claim status.");
    }
    status = patch.status;
  }

  let followedUpAt = current.followedUpAt;
  if (patch.followedUp !== undefined) {
    followedUpAt = patch.followedUp ? new Date().toISOString() : null;
  }

  db.prepare(
    `UPDATE reimbursement_claim
       SET person = @person, expected = @expected, note = @note,
           status = @status, followed_up_at = @followedUpAt
     WHERE id = @id`,
  ).run({ id, person, expected, note, status, followedUpAt });
  return getClaim(db, id);
}

export function deleteClaim(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM reimbursement_claim WHERE id = ?`).run(id);
}

export function deleteAllClaims(db: Database.Database): void {
  db.prepare(`DELETE FROM reimbursement_claim`).run();
}
