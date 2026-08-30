/**
 * SQLite schema + migrations.
 *
 * `migrate()` is idempotent and bumps `PRAGMA user_version`. To evolve the
 * schema, add a `if (version < N)` block and raise `SCHEMA_VERSION`.
 */

import type Database from "better-sqlite3";

export const SCHEMA_VERSION = 2;

const V1 = `
CREATE TABLE IF NOT EXISTS transactions (
  id                      TEXT PRIMARY KEY,
  account_id              TEXT NOT NULL,
  group_name              TEXT NOT NULL,
  date                    TEXT NOT NULL,
  description             TEXT NOT NULL,
  amount                  REAL NOT NULL,
  direction               TEXT NOT NULL,
  balance                 REAL,
  transfer_state          TEXT NOT NULL,
  transfer_pair_id        TEXT,
  counterparty_account_id TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',
  category                TEXT,
  subcategory             TEXT,
  imported_at             TEXT NOT NULL,
  categorized_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
`;

// v2: track how a row was categorized (a rule, or by hand) and which rule.
const V2 = `
ALTER TABLE transactions ADD COLUMN categorized_by TEXT;
ALTER TABLE transactions ADD COLUMN rule_label TEXT;
`;

export function migrate(db: Database.Database): void {
  const version = db.pragma("user_version", { simple: true }) as number;

  if (version < 1) db.exec(V1);
  if (version < 2) db.exec(V2);

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
