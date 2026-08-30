/**
 * Reset the dev profile to a copy of prod.
 *
 *   npm run seed:dev
 *
 * Wipes `data/dev/` and recursively copies `data/prod/` into it — database and
 * configs alike — so feature work starts from a realistic snapshot without ever
 * touching your real record. Re-run any time to discard dev changes.
 *
 * Run directly with Node (>=22 strips the TypeScript): `node scripts/seed-dev.ts`.
 */

import { access, cp, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const prod = path.join(root, "data", "prod");
const dev = path.join(root, "data", "dev");

try {
  await access(prod);
} catch {
  console.error(
    `Nothing to copy: ${path.relative(root, prod)}/ does not exist yet. ` +
      "Set up the prod profile first (see README → Dev vs prod).",
  );
  process.exit(1);
}

await rm(dev, { recursive: true, force: true });
await cp(prod, dev, { recursive: true });

console.log(
  `Seeded ${path.relative(root, dev)}/ from ${path.relative(root, prod)}/.`,
);
console.log(
  "Next: edit data/dev/config/accounts.json to use fake account numbers and a " +
    "dev (or bogus) sink, so a stray “Push to Sheets” in dev can't reach your real spreadsheets.",
);
