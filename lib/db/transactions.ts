/**
 * Queries over the `transactions` table.
 *
 * Every function takes an explicit `db` so it can be unit-tested against an
 * in-memory database (see `transactions.test.ts`). The connection singleton
 * lives in `./index.ts`.
 */

import type Database from "better-sqlite3";
import type { RuleMatch } from "../rules/apply.ts";
import type { ReconciledTransaction } from "../transactions/types.ts";

export type TxnStatus = "pending" | "categorized" | "skipped" | "excluded";

export type CategorizedBy = "rule" | "manual";

/** A stored row: every reconciled field plus its categorization state. */
export interface StoredTransaction extends ReconciledTransaction {
  status: TxnStatus;
  category: string | null;
  subcategory: string | null;
  categorizedBy: CategorizedBy | null;
  ruleLabel: string | null;
  importedAt: string;
  categorizedAt: string | null;
}

interface Row {
  id: string;
  account_id: string;
  group_name: string;
  date: string;
  description: string;
  amount: number;
  direction: string;
  balance: number | null;
  transfer_state: string;
  transfer_pair_id: string | null;
  counterparty_account_id: string | null;
  status: TxnStatus;
  category: string | null;
  subcategory: string | null;
  categorized_by: CategorizedBy | null;
  rule_label: string | null;
  imported_at: string;
  categorized_at: string | null;
}

function toStored(row: Row): StoredTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    group: row.group_name,
    date: row.date,
    description: row.description,
    amount: row.amount,
    direction: row.direction as ReconciledTransaction["direction"],
    balance: row.balance,
    transferState: row.transfer_state as ReconciledTransaction["transferState"],
    transferPairId: row.transfer_pair_id,
    counterpartyAccountId: row.counterparty_account_id,
    status: row.status,
    category: row.category,
    subcategory: row.subcategory,
    categorizedBy: row.categorized_by,
    ruleLabel: row.rule_label,
    importedAt: row.imported_at,
    categorizedAt: row.categorized_at,
  };
}

/**
 * Insert reconciled transactions, skipping any whose `id` already exists (so a
 * re-imported statement never double-counts or overwrites a categorization).
 * Netted transfers land as `excluded`; everything else as `pending`.
 */
export function upsertTransactions(
  db: Database.Database,
  transactions: ReconciledTransaction[],
  importedAt: string,
): { inserted: number; alreadyPresent: number } {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (id, account_id, group_name, date, description, amount, direction, balance,
       transfer_state, transfer_pair_id, counterparty_account_id, status, imported_at)
    VALUES
      (@id, @accountId, @group, @date, @description, @amount, @direction, @balance,
       @transferState, @transferPairId, @counterpartyAccountId, @status, @importedAt)
  `);

  let inserted = 0;
  const runAll = db.transaction((rows: ReconciledTransaction[]) => {
    for (const t of rows) {
      const info = insert.run({
        id: t.id,
        accountId: t.accountId,
        group: t.group,
        date: t.date,
        description: t.description,
        amount: t.amount,
        direction: t.direction,
        balance: t.balance,
        transferState: t.transferState,
        transferPairId: t.transferPairId,
        counterpartyAccountId: t.counterpartyAccountId,
        status: t.transferState === "netted" ? "excluded" : "pending",
        importedAt,
      });
      inserted += info.changes;
    }
  });
  runAll(transactions);

  return { inserted, alreadyPresent: transactions.length - inserted };
}

/** Oldest first, so the categorize deck runs chronologically. */
export function listTransactions(
  db: Database.Database,
  opts: { status?: TxnStatus } = {},
): StoredTransaction[] {
  const rows = opts.status
    ? db
        .prepare(
          `SELECT * FROM transactions WHERE status = ? ORDER BY date ASC, id`,
        )
        .all(opts.status)
    : db.prepare(`SELECT * FROM transactions ORDER BY date ASC, id`).all();
  return (rows as Row[]).map(toStored);
}

export function getTransaction(
  db: Database.Database,
  id: string,
): StoredTransaction | undefined {
  const row = db
    .prepare(`SELECT * FROM transactions WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? toStored(row) : undefined;
}

/**
 * Categorize a transaction by hand, or (with `null`) mark it skipped. Clears any
 * rule attribution. Returns the updated row, or `undefined` if the id is unknown.
 */
export function setCategorization(
  db: Database.Database,
  id: string,
  value: { category: string; subcategory: string } | null,
): StoredTransaction | undefined {
  const now = new Date().toISOString();
  if (value === null) {
    db.prepare(
      `UPDATE transactions
         SET status = 'skipped', category = NULL, subcategory = NULL,
             categorized_by = NULL, rule_label = NULL, categorized_at = @now
       WHERE id = @id`,
    ).run({ id, now });
  } else {
    db.prepare(
      `UPDATE transactions
         SET status = 'categorized', category = @category, subcategory = @subcategory,
             categorized_by = 'manual', rule_label = NULL, categorized_at = @now
       WHERE id = @id`,
    ).run({ id, now, category: value.category, subcategory: value.subcategory });
  }
  return getTransaction(db, id);
}

/** Send a transaction back to `pending`, clearing its categorization. */
export function resetCategorization(
  db: Database.Database,
  id: string,
): StoredTransaction | undefined {
  db.prepare(
    `UPDATE transactions
       SET status = 'pending', category = NULL, subcategory = NULL,
           categorized_by = NULL, rule_label = NULL, categorized_at = NULL
     WHERE id = @id`,
  ).run({ id });
  return getTransaction(db, id);
}

/**
 * Apply rule matches to still-`pending` rows only (so a re-run never overrides a
 * manual categorization or an already-accepted one). Returns how many changed.
 */
export function applyRuleCategorizations(
  db: Database.Database,
  matches: RuleMatch[],
): number {
  const stmt = db.prepare(
    `UPDATE transactions
       SET status = 'categorized', category = @category, subcategory = @subcategory,
           categorized_by = 'rule', rule_label = @label, categorized_at = @now
     WHERE id = @id AND status = 'pending'`,
  );
  const now = new Date().toISOString();

  let changed = 0;
  const runAll = db.transaction((rows: RuleMatch[]) => {
    for (const m of rows) {
      changed += stmt.run({
        id: m.transactionId,
        category: m.category,
        subcategory: m.subcategory,
        label: m.label,
        now,
      }).changes;
    }
  });
  runAll(matches);

  return changed;
}

export function statusCounts(
  db: Database.Database,
): Record<TxnStatus, number> {
  const counts: Record<TxnStatus, number> = {
    pending: 0,
    categorized: 0,
    skipped: 0,
    excluded: 0,
  };
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM transactions GROUP BY status`)
    .all() as { status: TxnStatus; n: number }[];
  for (const { status, n } of rows) counts[status] = n;
  return counts;
}

export function deleteAllTransactions(db: Database.Database): void {
  db.prepare(`DELETE FROM transactions`).run();
}
