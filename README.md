# budget-helper

A simple app to assist in the process of categorizing and adding transaction data into budget spreadsheets.

## Status

Import, transfer reconciliation, the categorization card + review screen, and
local SQLite persistence are built. Spreadsheet sync is not started.

## Setup

```bash
npm install
cp config/accounts.example.json config/accounts.json   # then edit it
npm run dev
```

Then open http://localhost:3000. `config/accounts.json` is gitignored (it holds
your account numbers and spreadsheet ids); the `.example` is the template.
`config/categories.json` is committed — edit it directly to change the taxonomy,
or add entries from the Categorize screen (the app writes back to this file).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | Lint |
| `npm test` | Run unit tests (`node --test`) |

## Import flow

Upload all your statement CSVs at once (one per account, same date range).
Each file is assigned to an account; then the pipeline runs in three stages:

```
parseCsv            CSV text -> ParsedTransaction[]      (one file, no account)   lib/transactions/parse.ts
assignAccount       + accountId, + group, id rehashed    (file tied to account)   lib/transactions/assign.ts
reconcileTransfers  classify inter-account transfers     (whole batch)            lib/transactions/reconcile.ts
```

### Transfer reconciliation

A transfer between two of your accounts appears twice — a debit in one file, a
credit in another. Matched legs (opposite sign, equal amount, dates within
`maxDaysApart`, counterparty account numbers cross-referenced) are labelled:

| `transferState` | When | Effect |
|---|---|---|
| `netted` | both accounts in the **same** group | dropped from the budget |
| `cross_group` | accounts in **different** groups (personal ↔ shared) | **kept** — so moving money into the shared account still shows in both budgets |
| `unmatched` | looks like a transfer but no partner leg in the batch | kept, flagged for manual review |
| `none` | everything else | untouched |

`maxDaysApart` defaults to 1 (same-bank transfers settle instantly).

## Categorization

After import the app steps through a three-stage flow (`Import → Categorize →
Review`, driven by `app/page.tsx`):

- **Categorize** — one card per transaction (netted transfers excluded). Pick a
  category, then a subcategory, via a keyboard-first filter box: type to narrow,
  `↑`/`↓` to move, `Enter` to pick. `⌥S` skips, `⌥←` / `⌥→` move between cards.
  Picking a subcategory auto-advances. If your text matches nothing, a
  **Create "…"** row appears — selecting it adds the category/subcategory (a new
  category is written only once you name its first subcategory) and `POST`s it to
  `config/categories.json` so it sticks for later sessions. New entries append to
  the end; renaming/deleting is done by editing the file.
- **Review** — per-group (`personal` / `shared`) net totals broken down by
  category → subcategory, plus counts of skipped / pending / netted / cross-group
  rows and a list of skipped transactions to follow up. `Download CSV` is a
  stopgap until the `sink` exists.

## Persistence

Imported transactions and their categorizations live in a local SQLite database
(`data/budget-helper.db`, gitignored; override the path with `BUDGET_DB_PATH`).
The client holds no durable state — it reads the working set from
`GET /api/transactions` on load and picks the stage from it (pending rows →
Categorize, otherwise → Review or Import).

- `POST /api/import` parses + reconciles, then `INSERT OR IGNORE`s by content
  hash — re-importing a statement never double-counts and never overwrites a
  categorization you already made. Netted transfers are stored as `excluded`.
- `PATCH /api/transactions/:id` — `{ category, subcategory }` or
  `{ status: "skipped" }` — one call per card, optimistic on the client.
- `DELETE /api/transactions` — the "Clear all data" escape hatch.

`better-sqlite3` (synchronous); `serverExternalPackages` in `next.config.ts`
keeps the native addon unbundled. The connection singleton is in `lib/db/`;
query functions take an explicit `db` and are unit-tested against `:memory:`.

Aggregation logic lives in `lib/transactions/summary.ts` (pure, unit-tested);
the taxonomy is `config/categories.json`, read via `GET /api/categories` and
extended via `POST /api/categories` (`{ category, subcategory? }` — pure
`addToCategories` in `lib/categories/config.ts`, unit-tested).

## UI stack

Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (Radix primitives, owned
component source under `components/ui/`). `components.json` configures the
`shadcn` CLI so `npx shadcn@latest add <name>` works. Theme tokens are in
`app/globals.css` and follow the OS light/dark setting via a media query — no
`next-themes`, no toggle. `lib/utils.ts` has the `cn` helper.

## Config: `config/accounts.json`

- `accounts[]` — `id`, `label`, `number` (drives transfer detection), `type`, `group`
- `groups{}` — one entry per group, each with a `sink` describing where that
  group's data is written. The `sink` is not wired up yet; `kind` picks the
  implementation (`google-sheets`, later `excel`), the rest is passed through.

## Layout

```
app/
  layout.tsx              Root layout
  page.tsx                Flow orchestrator (client): loads from the DB, picks the stage
  globals.css             Tailwind v4 + shadcn theme tokens (OS light/dark)
  api/accounts/route.ts   GET the account list for the UI
  api/categories/route.ts GET the taxonomy / POST a new category or subcategory
  api/import/route.ts     POST files + accountIds -> parse, reconcile, upsert into the DB
  api/transactions/route.ts        GET stored rows (+?status=) / DELETE all
  api/transactions/[id]/route.ts   PATCH one row's categorization
components/
  ui/                     shadcn primitives (button, card, select, command, ...)
  AppHeader, Stepper, ImportStage, CategorizeStage,
  TransactionCard, CategoryPicker, ReviewStage, StatCard
hooks/useCategories.ts    Fetch the taxonomy
lib/utils.ts              cn() class-name helper
lib/format.ts             Money formatting
lib/db/
  index.ts                SQLite connection singleton (better-sqlite3)
  schema.ts               Schema + user_version migrations
  transactions.ts         Typed queries (upsert / list / setCategorization / ...), tested vs :memory:
lib/accounts/
  config.ts               Load + validate config/accounts.json
lib/categories/
  config.ts               Load / validate / mutate / write config/categories.json (pure fns tested)
lib/transactions/
  types.ts                Canonical shapes for each pipeline stage
  id.ts                   Content-hash helper for row ids
  profiles.ts             Per-bank CSV quirks + header-match detection
  parse.ts                Stage 1: CSV -> ParsedTransaction[]
  assign.ts               Stage 2: attach account
  reconcile.ts            Stage 3: classify inter-account transfers
  summary.ts              Deck filtering + review aggregation (pure)
  *.test.ts               Unit tests
config/
  accounts.example.json   Template (committed)
  accounts.json           Your real config (gitignored)
  categories.json         Category / subcategory taxonomy (committed, edit freely)
```

## Adding another bank

Add a `BankProfile` to `lib/transactions/profiles.ts` and push it onto
`bankProfiles`. Detection is by exact header-row match; nothing else changes.

## Planned build order

1. ~~CSV import + parsing.~~ Done.
2. ~~Multi-account upload + inter-account transfer reconciliation.~~ Done.
3. ~~Per-transaction review card: assign category / subcategory, plus review screen.~~ Done.
4. ~~Persist transactions + categorizations locally (SQLite).~~ Done.
5. Write categorized rows to a budget spreadsheet — Google Sheets first, Excel later, behind a common `sink` interface, one per group.
6. Reimbursement / split-expense tracking (design agreed; see notes).
