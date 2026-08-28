/**
 * Content hash identifying a transaction row.
 *
 * Server-only (`node:crypto`).
 */

import { createHash } from "node:crypto";

export interface TransactionIdParts {
  date: string;
  description: string;
  amount: number;
  balance: number | null;
}

/**
 * Hash the meaningful contents of a row, namespaced by `scope`.
 *
 * At parse time the scope is the bank profile id. Once a file has been assigned
 * to an account the id is recomputed with the account id as the scope — that
 * account-scoped form is the one used for de-duplication, so the same transfer
 * seen from two different accounts stays as two distinct rows.
 */
export function transactionId(scope: string, parts: TransactionIdParts): string {
  return createHash("sha1")
    .update(
      [scope, parts.date, parts.description, parts.amount, parts.balance ?? ""].join(
        "|",
      ),
    )
    .digest("hex");
}
