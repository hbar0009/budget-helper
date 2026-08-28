import assert from "node:assert/strict";
import { test } from "node:test";
import { CategoriesConfigError, parseCategoriesConfig } from "./config.ts";

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
