/**
 * Stage 2: tie a parsed file to an account.
 *
 * Recomputes each row's `id` with the account id as the hash scope, so the same
 * transfer seen from two accounts produces two distinct rows.
 */

import type { Account } from "../accounts/config.ts";
import { transactionId } from "./id.ts";
import type { AccountTransaction, ParsedTransaction } from "./types.ts";

export function assignAccount(
  transactions: ParsedTransaction[],
  account: Account,
): AccountTransaction[] {
  return transactions.map((t) => ({
    ...t,
    id: transactionId(account.id, {
      date: t.date,
      description: t.description,
      amount: t.amount,
      balance: t.balance,
    }),
    accountId: account.id,
    group: account.group,
  }));
}
