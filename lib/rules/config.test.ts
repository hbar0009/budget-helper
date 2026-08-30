import assert from "node:assert/strict";
import { test } from "node:test";
import type { CategoriesConfig } from "../categories/config.ts";
import {
  RulesConfigError,
  addRule,
  parseRulesConfig,
  validateRulesAgainstCategories,
  type Rule,
} from "./config.ts";

test("parses a valid rules file", () => {
  const { rules } = parseRulesConfig(
    JSON.stringify({
      rules: [
        { label: "Salary", contains: "ACME", direction: "credit", category: "Income", subcategory: "Salary" },
        { regex: "RENT.*PROP", category: "Housing", subcategory: "Rent" },
      ],
    }),
  );
  assert.equal(rules.length, 2);
  assert.equal(rules[0].direction, "credit");
});

test("an empty rules array is valid", () => {
  assert.deepEqual(parseRulesConfig(JSON.stringify({ rules: [] })), { rules: [] });
});

test("rejects a rule with both contains and regex", () => {
  assert.throws(
    () =>
      parseRulesConfig(
        JSON.stringify({
          rules: [{ contains: "a", regex: "b", category: "X", subcategory: "Y" }],
        }),
      ),
    RulesConfigError,
  );
});

test("rejects a rule with neither contains nor regex", () => {
  assert.throws(
    () =>
      parseRulesConfig(
        JSON.stringify({ rules: [{ category: "X", subcategory: "Y" }] }),
      ),
    RulesConfigError,
  );
});

test("rejects an uncompilable regex", () => {
  assert.throws(
    () =>
      parseRulesConfig(
        JSON.stringify({
          rules: [{ regex: "(", category: "X", subcategory: "Y" }],
        }),
      ),
    RulesConfigError,
  );
});

test("rejects a rule missing category / subcategory", () => {
  assert.throws(
    () => parseRulesConfig(JSON.stringify({ rules: [{ contains: "a", category: "X" }] })),
    RulesConfigError,
  );
});

test("rejects an invalid direction and a negative amount bound", () => {
  assert.throws(
    () =>
      parseRulesConfig(
        JSON.stringify({
          rules: [{ contains: "a", direction: "sideways", category: "X", subcategory: "Y" }],
        }),
      ),
    RulesConfigError,
  );
  assert.throws(
    () =>
      parseRulesConfig(
        JSON.stringify({
          rules: [{ contains: "a", minAmount: -5, category: "X", subcategory: "Y" }],
        }),
      ),
    RulesConfigError,
  );
});

test("rejects malformed JSON", () => {
  assert.throws(() => parseRulesConfig("{ not json"), RulesConfigError);
});

test("addRule appends and trims, dropping blank optional fields", () => {
  const next = addRule(
    { rules: [{ contains: "acme", category: "Income", subcategory: "Salary" }] },
    {
      contains: "  SPOTIFY  ",
      regex: "",
      account: "",
      direction: "debit",
      minAmount: 5,
      category: " Entertainment ",
      subcategory: " Streaming ",
    },
  );

  assert.equal(next.rules.length, 2);
  assert.deepEqual(next.rules[1], {
    category: "Entertainment",
    subcategory: "Streaming",
    contains: "SPOTIFY",
    direction: "debit",
    minAmount: 5,
  });
});

test("addRule does not mutate the input config", () => {
  const config = { rules: [] as Rule[] };
  addRule(config, { contains: "x", category: "A", subcategory: "B" });
  assert.equal(config.rules.length, 0);
});

test("addRule rejects a rule with neither contains nor regex", () => {
  assert.throws(
    () => addRule({ rules: [] }, { category: "A", subcategory: "B" } as Rule),
    RulesConfigError,
  );
});

test("addRule rejects a rule missing a subcategory", () => {
  assert.throws(
    () => addRule({ rules: [] }, { contains: "x", category: "A" } as Rule),
    RulesConfigError,
  );
});

const CATEGORIES: CategoriesConfig = {
  categories: [
    { name: "Income", subcategories: ["Salary", "Interest"] },
    { name: "Housing", subcategories: ["Rent"] },
  ],
};

test("validateRulesAgainstCategories keeps valid rules and warns on unknown targets", () => {
  const { valid, warnings } = validateRulesAgainstCategories(
    [
      { contains: "acme", category: "Income", subcategory: "Salary" },
      { contains: "rent", category: "Housing", subcategory: "Rent" },
      { contains: "spot", category: "Entertainment", subcategory: "Streaming" },
      { contains: "int", category: "Income", subcategory: "Dividends" },
    ],
    CATEGORIES,
  );

  assert.equal(valid.length, 2);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Entertainment \/ Streaming/);
});
