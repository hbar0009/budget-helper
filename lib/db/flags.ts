/**
 * Queries over the `flag` table — free-form annotations on transactions that
 * outlive a single batch and get surfaced in the end-of-batch review.
 *
 * v1 kinds:
 *   - `wrong_account`: paid from the wrong account; note which it should have
 *     been, and (later) link the transfer that corrected it.
 *   - `note`: a free-text "needs action" reminder.
 *
 * Every function takes an explicit `db` so it can be unit-tested against an
 * in-memory database (see `flags.test.ts`).
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type FlagKind = "wrong_account" | "note";
export type FlagStatus = "open" | "resolved";

const KINDS: FlagKind[] = ["wrong_account", "note"];

export interface WrongAccountData {
  /** Group it should have been paid from (`personal` / `shared`). */
  shouldBeGroup?: string;
  /** Account id it should have been paid from. */
  shouldBeAccountId?: string;
  note?: string;
  /** Set once a later transfer that corrects this is linked (flag → resolved). */
  correctedByTxnId?: string;
}

export interface NoteData {
  text: string;
}

export type FlagData = WrongAccountData | NoteData;

export interface Flag {
  id: string;
  txnId: string;
  kind: FlagKind;
  data: FlagData;
  status: FlagStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export class FlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagError";
  }
}

interface Row {
  id: string;
  txn_id: string;
  kind: string;
  data: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

function toFlag(row: Row): Flag {
  return {
    id: row.id,
    txnId: row.txn_id,
    kind: row.kind as FlagKind,
    data: parseData(row.data),
    status: row.status as FlagStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function parseData(raw: string): FlagData {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as FlagData) : ({} as FlagData);
  } catch {
    return {} as FlagData;
  }
}

export function isFlagKind(value: unknown): value is FlagKind {
  return typeof value === "string" && (KINDS as string[]).includes(value);
}

/** Validate + trim kind-specific data. Pure; throws `FlagError`. */
export function normalizeFlagData(kind: FlagKind, data: unknown): FlagData {
  const d = (data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  if (kind === "note") {
    const text = str(d.text);
    if (!text) throw new FlagError("A note flag needs some text.");
    return { text };
  }

  const out: WrongAccountData = {};
  const shouldBeGroup = str(d.shouldBeGroup);
  const shouldBeAccountId = str(d.shouldBeAccountId);
  const note = str(d.note);
  const correctedByTxnId = str(d.correctedByTxnId);
  if (shouldBeGroup) out.shouldBeGroup = shouldBeGroup;
  if (shouldBeAccountId) out.shouldBeAccountId = shouldBeAccountId;
  if (note) out.note = note;
  if (correctedByTxnId) out.correctedByTxnId = correctedByTxnId;
  return out;
}

export function listFlags(
  db: Database.Database,
  opts: { status?: FlagStatus } = {},
): Flag[] {
  const rows = opts.status
    ? db
        .prepare(`SELECT * FROM flag WHERE status = ? ORDER BY created_at, id`)
        .all(opts.status)
    : db.prepare(`SELECT * FROM flag ORDER BY created_at, id`).all();
  return (rows as Row[]).map(toFlag);
}

/** Transaction id → its flags, for the `GET /api/transactions` join. */
export function flagsByTxn(db: Database.Database): Record<string, Flag[]> {
  const out: Record<string, Flag[]> = {};
  for (const flag of listFlags(db)) (out[flag.txnId] ??= []).push(flag);
  return out;
}

export function flagsForTxn(db: Database.Database, txnId: string): Flag[] {
  const rows = db
    .prepare(`SELECT * FROM flag WHERE txn_id = ? ORDER BY created_at, id`)
    .all(txnId);
  return (rows as Row[]).map(toFlag);
}

export function getFlag(db: Database.Database, id: string): Flag | undefined {
  const row = db.prepare(`SELECT * FROM flag WHERE id = ?`).get(id) as
    | Row
    | undefined;
  return row ? toFlag(row) : undefined;
}

export function addFlag(
  db: Database.Database,
  txnId: string,
  kind: FlagKind,
  data: unknown,
): Flag {
  const exists = db
    .prepare(`SELECT 1 FROM transactions WHERE id = ?`)
    .get(txnId);
  if (!exists) throw new FlagError("Unknown transaction.");

  const clean = normalizeFlagData(kind, data);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO flag (id, txn_id, kind, data, status, created_at)
     VALUES (@id, @txnId, @kind, @data, 'open', @now)`,
  ).run({
    id,
    txnId,
    kind,
    data: JSON.stringify(clean),
    now: new Date().toISOString(),
  });
  return getFlag(db, id)!;
}

export function updateFlagData(
  db: Database.Database,
  id: string,
  data: unknown,
): Flag | undefined {
  const current = getFlag(db, id);
  if (!current) return undefined;
  const clean = normalizeFlagData(current.kind, data);

  // The corrective-transfer link is resolution metadata, not user payload — a
  // plain data edit must not drop it.
  if (current.kind === "wrong_account") {
    const linked = (current.data as WrongAccountData).correctedByTxnId;
    if (linked && !(clean as WrongAccountData).correctedByTxnId) {
      (clean as WrongAccountData).correctedByTxnId = linked;
    }
  }

  db.prepare(`UPDATE flag SET data = @data WHERE id = @id`).run({
    id,
    data: JSON.stringify(clean),
  });
  return getFlag(db, id);
}

/** Mark a flag resolved, optionally recording the transfer that corrected it. */
export function resolveFlag(
  db: Database.Database,
  id: string,
  opts: { correctedByTxnId?: string } = {},
): Flag | undefined {
  const current = getFlag(db, id);
  if (!current) return undefined;
  const data = { ...current.data } as WrongAccountData;
  if (opts.correctedByTxnId) data.correctedByTxnId = opts.correctedByTxnId;
  db.prepare(
    `UPDATE flag SET status = 'resolved', resolved_at = @now, data = @data WHERE id = @id`,
  ).run({ id, now: new Date().toISOString(), data: JSON.stringify(data) });
  return getFlag(db, id);
}

export function reopenFlag(
  db: Database.Database,
  id: string,
): Flag | undefined {
  const current = getFlag(db, id);
  if (!current) return undefined;
  const data = { ...current.data } as WrongAccountData;
  delete data.correctedByTxnId;
  db.prepare(
    `UPDATE flag SET status = 'open', resolved_at = NULL, data = @data WHERE id = @id`,
  ).run({ id, data: JSON.stringify(data) });
  return getFlag(db, id);
}

export function deleteFlag(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM flag WHERE id = ?`).run(id);
}

export function deleteAllFlags(db: Database.Database): void {
  db.prepare(`DELETE FROM flag`).run();
}
