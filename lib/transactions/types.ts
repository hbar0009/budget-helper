/**
 * Canonical shapes produced by the import pipeline, in the order the stages run:
 *
 *   parseCsv            -> ParsedTransaction        (one file, no account context)
 *   assignAccount       -> AccountTransaction       (file tied to an account)
 *   reconcileTransfers  -> ReconciledTransaction    (inter-account transfers classified)
 *
 * Everything downstream (the review card, the spreadsheet writer) should depend
 * on these types rather than on any bank's specific CSV layout.
 */

export type TransactionDirection = "credit" | "debit";

/** A single row after parsing + normalization, before we know which account it
 *  belongs to. */
export interface ParsedTransaction {
  /** Content hash. Provisional at this stage — recomputed once the account is
   *  known (see `AccountTransaction`). */
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Description text from the statement, trimmed but otherwise untouched. */
  description: string;
  /** Signed amount: negative = money out, positive = money in. */
  amount: number;
  /** Convenience flag derived from the sign of `amount`. */
  direction: TransactionDirection;
  /** Account balance after this transaction, or `null` if the statement omits it. */
  balance: number | null;
}

/** A parsed row once its file has been assigned to an account. */
export interface AccountTransaction extends ParsedTransaction {
  accountId: string;
  /** The account's group (e.g. `personal` / `shared`) — the only thing sheet
   *  routing needs. Denormalized here so downstream code needn't re-load config. */
  group: string;
}

export type TransferState =
  /** Not an inter-account transfer. */
  | "none"
  /** Matched transfer between two accounts in the *same* group — excluded from
   *  the budget, since moving money within a group isn't spending. */
  | "netted"
  /** Matched transfer between two *different* groups (personal <-> shared) —
   *  kept, so funding the shared account still shows up in each budget. */
  | "cross_group"
  /** Looks like a transfer but no counterpart leg was found in this batch. */
  | "unmatched";

/** A row once inter-account transfers have been classified. */
export interface ReconciledTransaction extends AccountTransaction {
  transferState: TransferState;
  /** Shared by the two legs of a matched transfer; `null` otherwise. */
  transferPairId: string | null;
  /** The other account in the transfer, when identifiable from the description. */
  counterpartyAccountId: string | null;
}

/** A row that could not be parsed. Collected rather than thrown, so one bad
 *  line doesn't abort the whole import. */
export interface ImportRowError {
  /** 1-based row number within the file (row 1 = first line after the header). */
  row: number;
  message: string;
  /** The raw cell values, kept for debugging. */
  raw: Record<string, string>;
  /** Which account's file the row came from (set by the import route). */
  accountId?: string;
}

/** Result of parsing one CSV file. */
export interface ImportResult {
  profileId: string;
  transactions: ParsedTransaction[];
  errors: ImportRowError[];
}

export interface TransferSummary {
  /** Same-group transfer pairs that were netted out. */
  nettedPairs: number;
  /** Cross-group transfer pairs that were kept. */
  crossGroupPairs: number;
  /** Transfer-looking rows with no matching leg in the batch. */
  unmatched: number;
}

/** Result of importing several files at once (the real flow: all accounts,
 *  same date range). */
export interface MultiImportResult {
  transactions: ReconciledTransaction[];
  transfers: TransferSummary;
  errors: ImportRowError[];
}
