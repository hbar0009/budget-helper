import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CategoriesConfigError,
  addToCategories,
  parseCategoriesConfig,
} from "./config.ts";

const base = () =>
  parseCategoriesConfig(
    JSON.stringify({
      categories: [
        { name: "Groceries", subcategories: ["Supermarket"] },
        { name: "Transport", subcategories: ["Fuel", "Parking"] },
      ],
    }),
  );

test("parses a valid config", () => {
  const config = parseCategoriesConfig(
    JSON.stringify({
      categories: [
        { name: "Groceries", subcategories: ["Supermarket", "Market"] },
        { name: "Transport", subcategories: ["Fuel"] },
      ],
    }),
  );

  assert.equal(config.categories.length, 2);
  assert.deepEqual(config.categories[0].subcategories, ["Supermarket", "Market"]);
});

test("rejects an empty category list", () => {
  assert.throws(
    () => parseCategoriesConfig(JSON.stringify({ categories: [] })),
    CategoriesConfigError,
  );
});

test("rejects a duplicate category name", () => {
  assert.throws(
    () =>
      parseCategoriesConfig(
        JSON.stringify({
          categories: [
            { name: "Food", subcategories: ["a"] },
            { name: "Food", subcategories: ["b"] },
          ],
        }),
      ),
    CategoriesConfigError,
  );
});

test("rejects a category with no subcategories", () => {
  assert.throws(
    () =>
      parseCategoriesConfig(
        JSON.stringify({ categories: [{ name: "Food", subcategories: [] }] }),
      ),
    CategoriesConfigError,
  );
});

test("rejects malformed JSON", () => {
  assert.throws(() => parseCategoriesConfig("{ not json"), CategoriesConfigError);
});

test("addToCategories appends a new category with its first subcategory", () => {
  const next = addToCategories(base(), {
    category: "Coffee",
    subcategory: "Beans",
  });

  assert.equal(next.categories.length, 3);
  assert.deepEqual(next.categories[2], {
    name: "Coffee",
    subcategories: ["Beans"],
  });
});

test("addToCategories appends a subcategory to an existing category", () => {
  const next = addToCategories(base(), {
    category: "Transport",
    subcategory: "Tolls",
  });

  assert.deepEqual(
    next.categories.find((c) => c.name === "Transport")?.subcategories,
    ["Fuel", "Parking", "Tolls"],
  );
});

test("addToCategories matches case-insensitively and is idempotent", () => {
  const next = addToCategories(base(), {
    category: "transport",
    subcategory: "FUEL",
  });

  assert.equal(next.categories.length, 2);
  assert.deepEqual(
    next.categories.find((c) => c.name === "Transport")?.subcategories,
    ["Fuel", "Parking"],
  );
});

test("addToCategories trims whitespace", () => {
  const next = addToCategories(base(), {
    category: "  Health  ",
    subcategory: "  Dental  ",
  });

  assert.ok(
    next.categories.some(
      (c) => c.name === "Health" && c.subcategories.includes("Dental"),
    ),
  );
});

test("addToCategories rejects a new category with no subcategory", () => {
  assert.throws(
    () => addToCategories(base(), { category: "Pets" }),
    CategoriesConfigError,
  );
});

test("addToCategories rejects an empty category name", () => {
  assert.throws(
    () => addToCategories(base(), { category: "   ", subcategory: "x" }),
    CategoriesConfigError,
  );
});

test("addToCategories does not mutate the input config", () => {
  const config = base();
  addToCategories(config, { category: "Transport", subcategory: "Tolls" });

  assert.deepEqual(
    config.categories.find((c) => c.name === "Transport")?.subcategories,
    ["Fuel", "Parking"],
  );
});
