/**
 * Bridge: run the auto-categorization rules over whatever is currently
 * `pending` in the database. Used by both `POST /api/import` (right after
 * upsert) and `POST /api/rules/apply` (the "re-run" button).
 */

import type Database from "better-sqlite3";
import { applyRuleCategorizations, listTransactions } from "../db/transactions.ts";
import { applyRules } from "./apply.ts";
import type { Rule } from "./config.ts";

export function runRulesOverPending(
  db: Database.Database,
  rules: Rule[],
): { matched: number } {
  if (rules.length === 0) return { matched: 0 };
  const pending = listTransactions(db, { status: "pending" });
  const matches = applyRules(pending, rules);
  return { matched: applyRuleCategorizations(db, matches) };
}
