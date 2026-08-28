/**
 * Loads and validates `config/categories.json` — your category / subcategory
 * taxonomy for the review card.
 *
 * Unlike `config/accounts.json`, this file has nothing sensitive in it, so it
 * is committed and meant to be edited directly.
 *
 * `loadCategoriesConfig` is server-only (reads the filesystem);
 * `parseCategoriesConfig` is pure and unit-tested.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface Category {
  name: string;
  subcategories: string[];
}

export interface CategoriesConfig {
  categories: Category[];
}

export class CategoriesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoriesConfigError";
  }
}

const CONFIG_PATH = path.join(process.cwd(), "config", "categories.json");

export async function loadCategoriesConfig(): Promise<CategoriesConfig> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch {
    throw new CategoriesConfigError(
      "No config/categories.json found. Restore it from version control or " +
        "create one with a `categories` array.",
    );
  }
  return parseCategoriesConfig(raw);
}

export function parseCategoriesConfig(raw: string): CategoriesConfig {
  let parsed: CategoriesConfig;
  try {
    parsed = JSON.parse(raw) as CategoriesConfig;
  } catch (err) {
    throw new CategoriesConfigError(
      `config/categories.json is not valid JSON: ${(err as Error).message}`,
    );
  }
  validate(parsed);
  return parsed;
}

function validate(config: CategoriesConfig): void {
  if (!Array.isArray(config.categories) || config.categories.length === 0) {
    throw new CategoriesConfigError("`categories` must be a non-empty array.");
  }

  const seen = new Set<string>();
  for (const category of config.categories) {
    if (!category?.name) {
      throw new CategoriesConfigError(
        `Category is missing "name": ${JSON.stringify(category)}`,
      );
    }
    if (seen.has(category.name)) {
      throw new CategoriesConfigError(`Duplicate category "${category.name}".`);
    }
    seen.add(category.name);

    if (
      !Array.isArray(category.subcategories) ||
      category.subcategories.length === 0
    ) {
      throw new CategoriesConfigError(
        `Category "${category.name}" needs a non-empty "subcategories" array.`,
      );
    }
    if (category.subcategories.some((s) => typeof s !== "string" || s === "")) {
      throw new CategoriesConfigError(
        `Category "${category.name}" has an empty subcategory.`,
      );
    }
  }
}
