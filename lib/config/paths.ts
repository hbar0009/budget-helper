/**
 * Where this run's state lives.
 *
 * `BUDGET_PROFILE` picks a data profile so feature work never touches your real
 * transaction record:
 *   - `dev`  — used by `npm run dev`;   state under `data/dev/`
 *   - `prod` — used by `npm start` and everything else (the default); `data/prod/`
 *
 * Each stateful path resolves as: an explicit `BUDGET_*_PATH` env var wins (this
 * is how tests stay isolated); otherwise it is derived from the profile
 * directory. Both the SQLite database and the mutable configs (rules, accounts,
 * categories, the Google key) move together with the profile.
 *
 * Server-only — every caller already reads the filesystem.
 */

import path from "node:path";

export type Profile = "dev" | "prod";

export const PROFILE: Profile =
  process.env.BUDGET_PROFILE === "dev" ? "dev" : "prod";

/** `data/<profile>/` — the root of this run's state. */
export const PROFILE_DIR = path.join(process.cwd(), "data", PROFILE);

const inProfile = (...segments: string[]) =>
  path.join(PROFILE_DIR, ...segments);

export const DB_PATH =
  process.env.BUDGET_DB_PATH ?? inProfile("budget-helper.db");

export const RULES_PATH =
  process.env.BUDGET_RULES_PATH ?? inProfile("config", "rules.json");

export const ACCOUNTS_PATH =
  process.env.BUDGET_ACCOUNTS_PATH ?? inProfile("config", "accounts.json");

export const CATEGORIES_PATH =
  process.env.BUDGET_CATEGORIES_PATH ?? inProfile("config", "categories.json");

export const GOOGLE_KEY_PATH =
  process.env.BUDGET_GOOGLE_KEY_PATH ?? inProfile("config", "service-account.json");
