/**
 * Loads and validates `config/rules.json` — the auto-categorization rules
 * applied right after import.
 *
 * This file is likely personal (employer names, investment references), so it
 * is gitignored; `config/rules.example.json` is the template. A missing file is
 * fine — it just means no auto-categorization.
 *
 * `parseRulesConfig` is pure and unit-tested; `loadRulesConfig` reads the disk.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CategoriesConfig } from "../categories/config.ts";

export type MatchDirection = "credit" | "debit";

export interface Rule {
  /** Human name, shown on the auto-review screen. */
  label?: string;
  /** Case-insensitive substring match on the description. */
  contains?: string;
  /** Case-insensitive regular expression match on the description. */
  regex?: string;
  /** Only match this direction of money. */
  direction?: MatchDirection;
  /** Only match transactions from this account id. */
  account?: string;
  /** Bounds on the transaction's *absolute* amount. */
  minAmount?: number;
  maxAmount?: number;
  /** What to assign — must exist in `config/categories.json`. */
  category: string;
  subcategory: string;
}

export interface RulesConfig {
  rules: Rule[];
}

export class RulesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulesConfigError";
  }
}

const CONFIG_PATH = path.join(process.cwd(), "config", "rules.json");

/** Missing file -> no rules. Malformed file -> throws `RulesConfigError`. */
export async function loadRulesConfig(): Promise<RulesConfig> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch {
    return { rules: [] };
  }
  return parseRulesConfig(raw);
}

export function parseRulesConfig(raw: string): RulesConfig {
  let parsed: RulesConfig;
  try {
    parsed = JSON.parse(raw) as RulesConfig;
  } catch (err) {
    throw new RulesConfigError(
      `config/rules.json is not valid JSON: ${(err as Error).message}`,
    );
  }

  if (!Array.isArray(parsed?.rules)) {
    throw new RulesConfigError("`rules` must be an array.");
  }

  parsed.rules.forEach((rule, i) => validateRule(rule, i));
  return parsed;
}

function validateRule(rule: Rule, index: number): void {
  const where = rule?.label ? `Rule "${rule.label}"` : `Rule #${index + 1}`;

  const hasContains = typeof rule?.contains === "string" && rule.contains !== "";
  const hasRegex = typeof rule?.regex === "string" && rule.regex !== "";
  if (hasContains === hasRegex) {
    throw new RulesConfigError(
      `${where} must have exactly one of "contains" or "regex".`,
    );
  }
  if (hasRegex) {
    try {
      new RegExp(rule.regex as string);
    } catch (err) {
      throw new RulesConfigError(
        `${where} has an invalid regex: ${(err as Error).message}`,
      );
    }
  }

  if (!rule.category || !rule.subcategory) {
    throw new RulesConfigError(`${where} needs a "category" and "subcategory".`);
  }

  if (rule.direction && rule.direction !== "credit" && rule.direction !== "debit") {
    throw new RulesConfigError(
      `${where} has an invalid "direction" (use "credit" or "debit").`,
    );
  }

  for (const key of ["minAmount", "maxAmount"] as const) {
    const value = rule[key];
    if (value !== undefined && (typeof value !== "number" || !(value >= 0))) {
      throw new RulesConfigError(`${where} has an invalid "${key}".`);
    }
  }
}

/**
 * Cross-check rule targets against the category taxonomy. Rules pointing at an
 * unknown category/subcategory are dropped with a warning rather than failing
 * the whole import.
 */
export function validateRulesAgainstCategories(
  rules: Rule[],
  categories: CategoriesConfig,
): { valid: Rule[]; warnings: string[] } {
  const valid: Rule[] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    const category = categories.categories.find(
      (c) => c.name === rule.category,
    );
    const ok = category?.subcategories.includes(rule.subcategory) ?? false;
    if (ok) {
      valid.push(rule);
    } else {
      const name = rule.label ?? rule.contains ?? rule.regex ?? "rule";
      warnings.push(
        `Rule "${name}" targets "${rule.category} / ${rule.subcategory}", which is not in config/categories.json — skipped.`,
      );
    }
  }

  return { valid, warnings };
}
