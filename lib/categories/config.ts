/**
 * Loads and validates the category / subcategory taxonomy for the review card.
 *
 * The live file is `data/<profile>/config/categories.json` (see
 * `../config/paths.ts`; override with `BUDGET_CATEGORIES_PATH`) — the app writes
 * back to it as you add categories. `config/categories.example.json` is the
 * committed starting taxonomy to seed a new profile from.
 *
 * `loadCategoriesConfig` is server-only (reads the filesystem);
 * `parseCategoriesConfig` is pure and unit-tested.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATEGORIES_PATH as CONFIG_PATH } from "../config/paths.ts";

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

export async function loadCategoriesConfig(): Promise<CategoriesConfig> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch {
    throw new CategoriesConfigError(
      `No categories config at ${CONFIG_PATH}. Copy ` +
        "config/categories.example.json there (or run `npm run seed:dev`).",
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

/**
 * Return a new config with `category` (and optionally `subcategory`) folded in.
 * Pure — does not mutate `config`.
 *
 *  - unknown category  -> appended; `subcategory` is required and becomes its first
 *  - known category    -> `subcategory` appended if given and not already present
 *  - everything already present -> unchanged
 *
 * Matching is case-insensitive; names are trimmed. New entries go at the end.
 */
export function addToCategories(
  config: CategoriesConfig,
  input: { category: string; subcategory?: string },
): CategoriesConfig {
  const categoryName = input.category.trim();
  const subcategoryName = input.subcategory?.trim() ?? "";

  if (!categoryName) {
    throw new CategoriesConfigError("Category name is required.");
  }

  const categories = config.categories.map((c) => ({
    name: c.name,
    subcategories: [...c.subcategories],
  }));

  const existing = categories.find(
    (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
  );

  if (existing) {
    const known = existing.subcategories.some(
      (s) => s.toLowerCase() === subcategoryName.toLowerCase(),
    );
    if (subcategoryName && !known) {
      existing.subcategories.push(subcategoryName);
    }
  } else {
    if (!subcategoryName) {
      throw new CategoriesConfigError(
        `New category "${categoryName}" needs a subcategory.`,
      );
    }
    categories.push({ name: categoryName, subcategories: [subcategoryName] });
  }

  const next = { categories };
  validate(next);
  return next;
}

/** Overwrite the profile's categories.json (server-only). Validates first. */
export async function writeCategoriesConfig(
  config: CategoriesConfig,
): Promise<void> {
  validate(config);
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
