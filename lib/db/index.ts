/**
 * The SQLite connection singleton.
 *
 * Server-only. Opens `data/budget-helper.db` (override with `BUDGET_DB_PATH`),
 * runs migrations, and reuses one connection across requests — including across
 * dev hot-reloads, via a `globalThis` handle.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./schema.ts";

const DB_PATH =
  process.env.BUDGET_DB_PATH ??
  path.join(process.cwd(), "data", "budget-helper.db");

type WithDb = typeof globalThis & { __budgetHelperDb?: Database.Database };

export function getDb(): Database.Database {
  const globalWithDb = globalThis as WithDb;
  if (globalWithDb.__budgetHelperDb) return globalWithDb.__budgetHelperDb;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  globalWithDb.__budgetHelperDb = db;
  return db;
}
