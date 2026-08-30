/**
 * The spreadsheet-agnostic output layer.
 *
 * `config/accounts.json` gives every group a `sink` (`{ kind, ... }`); `kind`
 * picks the implementation (`google-sheets` today, `excel` later). Everything
 * downstream depends on these shapes, never on a specific spreadsheet API.
 */

/** One line as it lands in the spreadsheet — one per pushed transaction. */
export interface SinkRow {
  /** Content-hash transaction id. The upsert key: a re-push finds the row by
   *  this and updates it in place rather than duplicating it. */
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  description: string;
  /** Account label (not the id). */
  account: string;
  category: string;
  subcategory: string;
  /** Raw signed amount (negative = money out). */
  gross: number;
  /** How much of `gross` has been repaid to you (offsets `gross` toward zero).
   *  0 when the transaction has no reimbursement claims. */
  reimbursed: number;
  /** `gross + reimbursed` — what the transaction has actually cost you so far. */
  net: number;
  /** `""` when there are no claims, else the claims' collective state. */
  reimbStatus: "" | "open" | "partial" | "settled";
  /** People who owe you against this transaction, comma-joined. `""` if none. */
  owedBy: string;
}

/** What a `push` did. Rows are never deleted — only added or updated. */
export interface PushResult {
  added: number;
  updated: number;
  unchanged: number;
}

/** One group's destination. `push` must be idempotent: pushing the same rows
 *  twice leaves the spreadsheet unchanged the second time. */
export interface Sink {
  push(rows: SinkRow[]): Promise<PushResult>;
}

export class SinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SinkError";
  }
}
