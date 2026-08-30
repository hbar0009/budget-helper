/**
 * Loads and validates `config/rules.json` — the auto-categorization rules
 * applied right after import.
 *
 * This file is likely personal (employer names, investment references), so it
 * is gitignored; `config/rules.example.json` is the template. A missing file is
 * fine — it just means no auto-categorization. The path can be overridden with
 * `BUDGET_RULES_PATH` (used by tests so they never touch the real config).
 *
 * `parseRulesConfig` is pure and unit-tested; `loadRulesConfig` reads the disk.
 */

import { readFile, writeFile } from "node:fs/promises";
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

const CONFIG_PATH =
  process.env.BUDGET_RULES_PATH ??
  path.join(process.cwd(), "config", "rules.json");

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
 * Return a new config with `input` appended as the last (lowest-priority) rule.
 * Pure — does not mutate `config`. Blank optional fields are dropped so we never
 * persist `"regex": ""` or `"account": ""`. Throws `RulesConfigError` if the
 * resulting rule is not well-formed.
 */
export function addRule(config: RulesConfig, input: Rule): RulesConfig {
  const clean: Rule = {
    category: (input.category ?? "").trim(),
    subcategory: (input.subcategory ?? "").trim(),
  };

  const label = input.label?.trim();
  if (label) clean.label = label;

  const contains = input.contains?.trim();
  if (contains) clean.contains = contains;
  const regex = input.regex?.trim();
  if (regex) clean.regex = regex;

  if (input.direction) clean.direction = input.direction;
  const account = input.account?.trim();
  if (account) clean.account = account;
  if (input.minAmount !== undefined) clean.minAmount = input.minAmount;
  if (input.maxAmount !== undefined) clean.maxAmount = input.maxAmount;

  const next: RulesConfig = { rules: [...config.rules, clean] };
  validateRule(clean, next.rules.length - 1);
  return next;
}

/** Overwrite `config/rules.json` (server-only). Validates every rule first. */
export async function writeRulesConfig(config: RulesConfig): Promise<void> {
  if (!Array.isArray(config?.rules)) {
    throw new RulesConfigError("`rules` must be an array.");
  }
  config.rules.forEach((rule, i) => validateRule(rule, i));
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
