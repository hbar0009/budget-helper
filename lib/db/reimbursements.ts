/**
 * Queries over the `reimbursement_claim` and `reimbursement_repayment` tables —
 * "person P owes me `expected` for transaction T", and the money that has come
 * back against it. One fronted debit spawns one claim per person.
 *
 * Every function takes an explicit `db` so it can be unit-tested against an
 * in-memory database (see `reimbursements.test.ts`).
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type ClaimStatus = "open" | "settled" | "written_off";

const STATUSES: ClaimStatus[] = ["open", "settled", "written_off"];

/** A payment (bank credit or cash) applied against a claim. */
export interface Repayment {
  id: string;
  claimId: string;
  /** The incoming credit this came from, or `null` when paid in cash. */
  txnId: string | null;
  amount: number;
  createdAt: string;
}

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
  repayments: Repayment[];
  /** Σ of `repayments.amount`. */
  repaid: number;
  /** `expected - repaid`, or `null` when `expected` is unknown. */
  outstanding: number | null;
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

interface RepaymentRow {
  id: string;
  claim_id: string;
  txn_id: string | null;
  amount: number;
  created_at: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toRepayment(row: RepaymentRow): Repayment {
  return {
    id: row.id,
    claimId: row.claim_id,
    txnId: row.txn_id,
    amount: row.amount,
    createdAt: row.created_at,
  };
}

function toClaim(row: Row, repayments: Repayment[] = []): Claim {
  const repaid = round2(repayments.reduce((n, r) => n + r.amount, 0));
  return {
    id: row.id,
    txnId: row.txn_id,
    person: row.person,
    expected: row.expected,
    status: row.status as ClaimStatus,
    note: row.note,
    followedUpAt: row.followed_up_at,
    createdAt: row.created_at,
    repayments,
    repaid,
    outstanding: row.expected === null ? null : round2(row.expected - repaid),
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

export function listRepayments(db: Database.Database): Repayment[] {
  const rows = db
    .prepare(`SELECT * FROM reimbursement_repayment ORDER BY created_at, id`)
    .all();
  return (rows as RepaymentRow[]).map(toRepayment);
}

/** Claim id → its repayments. */
export function repaymentsByClaim(
  db: Database.Database,
): Record<string, Repayment[]> {
  const out: Record<string, Repayment[]> = {};
  for (const r of listRepayments(db)) (out[r.claimId] ??= []).push(r);
  return out;
}

/** Credit transaction id → the repayments it funds. */
export function repaymentsByTxn(
  db: Database.Database,
): Record<string, Repayment[]> {
  const out: Record<string, Repayment[]> = {};
  for (const r of listRepayments(db)) {
    if (r.txnId) (out[r.txnId] ??= []).push(r);
  }
  return out;
}

export function repaymentsForTxn(
  db: Database.Database,
  txnId: string,
): Repayment[] {
  return (
    db
      .prepare(`SELECT * FROM reimbursement_repayment WHERE txn_id = ?`)
      .all(txnId) as RepaymentRow[]
  ).map(toRepayment);
}

export function getRepayment(
  db: Database.Database,
  id: string,
): Repayment | undefined {
  const row = db
    .prepare(`SELECT * FROM reimbursement_repayment WHERE id = ?`)
    .get(id) as RepaymentRow | undefined;
  return row ? toRepayment(row) : undefined;
}

export function listClaims(db: Database.Database): Claim[] {
  const byClaim = repaymentsByClaim(db);
  const rows = db
    .prepare(`SELECT * FROM reimbursement_claim ORDER BY created_at, id`)
    .all();
  return (rows as Row[]).map((r) => toClaim(r, byClaim[r.id] ?? []));
}

/** Transaction id → its claims, for the `GET /api/transactions` join. */
export function claimsByTxn(db: Database.Database): Record<string, Claim[]> {
  const out: Record<string, Claim[]> = {};
  for (const claim of listClaims(db)) (out[claim.txnId] ??= []).push(claim);
  return out;
}

export function claimsForTxn(db: Database.Database, txnId: string): Claim[] {
  const byClaim = repaymentsByClaim(db);
  const rows = db
    .prepare(
      `SELECT * FROM reimbursement_claim WHERE txn_id = ? ORDER BY created_at, id`,
    )
    .all(txnId);
  return (rows as Row[]).map((r) => toClaim(r, byClaim[r.id] ?? []));
}

export function getClaim(db: Database.Database, id: string): Claim | undefined {
  const row = db
    .prepare(`SELECT * FROM reimbursement_claim WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? toClaim(row, repaymentsForClaim(db, id)) : undefined;
}

export function repaymentsForClaim(
  db: Database.Database,
  claimId: string,
): Repayment[] {
  return (
    db
      .prepare(
        `SELECT * FROM reimbursement_repayment WHERE claim_id = ? ORDER BY created_at, id`,
      )
      .all(claimId) as RepaymentRow[]
  ).map(toRepayment);
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

/** Validate one repayment. Pure; throws `ClaimError`. */
export function normalizeRepaymentInput(input: unknown): {
  txnId: string | null;
  amount: number;
} {
  const d = (input ?? {}) as Record<string, unknown>;

  const n = typeof d.amount === "number" ? d.amount : Number(d.amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ClaimError("A repayment needs a positive amount.");
  }

  const txnId =
    typeof d.txnId === "string" && d.txnId.trim() ? d.txnId.trim() : null;

  return { txnId, amount: round2(n) };
}

/** A credit is a repayment candidate only if it's incoming and not an
 *  own-account transfer. */
function assertRepaymentCredit(db: Database.Database, txnId: string): void {
  const row = db
    .prepare(
      `SELECT amount, transfer_state FROM transactions WHERE id = ?`,
    )
    .get(txnId) as { amount: number; transfer_state: string } | undefined;
  if (!row) throw new ClaimError("Unknown transaction.");
  if (row.amount <= 0) {
    throw new ClaimError("A repayment must be linked to an incoming credit.");
  }
  if (row.transfer_state !== "none" && row.transfer_state !== "unmatched") {
    throw new ClaimError("That credit is an inter-account transfer.");
  }
}

/**
 * Apply a repayment to a claim. If it brings an open claim to fully repaid, the
 * claim is auto-settled. Returns the updated claim.
 */
export function addRepayment(
  db: Database.Database,
  claimId: string,
  input: unknown,
): Claim {
  const claim = getClaim(db, claimId);
  if (!claim) throw new ClaimError("Unknown claim.");

  const { txnId, amount } = normalizeRepaymentInput(input);
  if (txnId) assertRepaymentCredit(db, txnId);

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO reimbursement_repayment (id, claim_id, txn_id, amount, created_at)
     VALUES (@id, @claimId, @txnId, @amount, @now)`,
  ).run({ id: randomUUID(), claimId, txnId, amount, now });

  const updated = getClaim(db, claimId)!;
  if (
    updated.status === "open" &&
    updated.expected !== null &&
    updated.repaid + 1e-9 >= updated.expected
  ) {
    db.prepare(
      `UPDATE reimbursement_claim SET status = 'settled' WHERE id = ?`,
    ).run(claimId);
    return getClaim(db, claimId)!;
  }
  return updated;
}

/** Remove a repayment. Does not auto-reopen a settled claim. */
export function deleteRepayment(
  db: Database.Database,
  id: string,
): Claim | undefined {
  const existing = getRepayment(db, id);
  if (!existing) return undefined;
  db.prepare(`DELETE FROM reimbursement_repayment WHERE id = ?`).run(id);
  return getClaim(db, existing.claimId);
}

export function deleteAllRepayments(db: Database.Database): void {
  db.prepare(`DELETE FROM reimbursement_repayment`).run();
}
