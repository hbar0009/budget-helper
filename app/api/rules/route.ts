import { NextResponse } from "next/server";
import {
  CategoriesConfigError,
  loadCategoriesConfig,
} from "@/lib/categories/config";
import { getDb } from "@/lib/db";
import {
  getTransaction,
  resetCategorization,
  statusCounts,
} from "@/lib/db/transactions";
import {
  RulesConfigError,
  addRule,
  loadRulesConfig,
  validateRulesAgainstCategories,
  writeRulesConfig,
  type Rule,
} from "@/lib/rules/config";
import { runRulesOverPending } from "@/lib/rules/run";

export const runtime = "nodejs";

/**
 * POST /api/rules — append a new auto-categorization rule to config/rules.json
 * (created if missing), then run the whole ruleset over the pending rows so it
 * takes effect immediately.
 *
 * Body: a Rule ({ contains|regex, category, subcategory, plus optional
 * label/direction/account/minAmount/maxAmount }) and an optional
 * `currentTransactionId` — the card you're on, which the new rule should claim
 * even if you'd already categorized it by hand.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const num = (v: unknown) => (typeof v === "number" && v >= 0 ? v : undefined);

  const rule: Rule = {
    label: str(body.label),
    contains: str(body.contains),
    regex: str(body.regex),
    direction:
      body.direction === "credit" || body.direction === "debit"
        ? body.direction
        : undefined,
    account: str(body.account),
    minAmount: num(body.minAmount),
    maxAmount: num(body.maxAmount),
    category: str(body.category) ?? "",
    subcategory: str(body.subcategory) ?? "",
  };
  const currentTransactionId = str(body.currentTransactionId);

  let config;
  let categories;
  try {
    config = await loadRulesConfig();
    categories = await loadCategoriesConfig();
  } catch (err) {
    if (err instanceof RulesConfigError || err instanceof CategoriesConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  if (validateRulesAgainstCategories([rule], categories).valid.length === 0) {
    return NextResponse.json(
      {
        error: `"${rule.category} / ${rule.subcategory}" is not in config/categories.json — add it on the card first.`,
      },
      { status: 400 },
    );
  }

  let next;
  try {
    next = addRule(config, rule);
    await writeRulesConfig(next);
  } catch (err) {
    if (err instanceof RulesConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const db = getDb();

  // Let the new rule take over the card you're on even if it was set by hand.
  // Skipped rows are a deliberate "leave it out" signal, so those stay put.
  if (currentTransactionId) {
    const row = getTransaction(db, currentTransactionId);
    if (row?.status === "categorized" && row.categorizedBy === "manual") {
      resetCategorization(db, currentTransactionId);
    }
  }

  const { valid } = validateRulesAgainstCategories(next.rules, categories);
  const { matched } = runRulesOverPending(db, valid);

  return NextResponse.json({
    rules: next.rules,
    matched,
    counts: statusCounts(db),
  });
}
