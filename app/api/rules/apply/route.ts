import { NextResponse } from "next/server";
import {
  CategoriesConfigError,
  loadCategoriesConfig,
} from "@/lib/categories/config";
import { getDb } from "@/lib/db";
import { statusCounts } from "@/lib/db/transactions";
import {
  RulesConfigError,
  loadRulesConfig,
  validateRulesAgainstCategories,
} from "@/lib/rules/config";
import { runRulesOverPending } from "@/lib/rules/run";

export const runtime = "nodejs";

/**
 * POST /api/rules/apply — re-run the rules over every currently-`pending` row.
 * Only pending rows are touched, so manual and already-accepted categorizations
 * are safe.
 */
export async function POST(): Promise<Response> {
  let rules;
  try {
    rules = (await loadRulesConfig()).rules;
  } catch (err) {
    if (err instanceof RulesConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  let warnings: string[] = [];
  let valid = rules;
  try {
    const categories = await loadCategoriesConfig();
    ({ valid, warnings } = validateRulesAgainstCategories(rules, categories));
  } catch (err) {
    if (!(err instanceof CategoriesConfigError)) throw err;
    warnings = [err.message];
    valid = [];
  }

  const db = getDb();
  const { matched } = runRulesOverPending(db, valid);

  return NextResponse.json({ matched, warnings, counts: statusCounts(db) });
}
