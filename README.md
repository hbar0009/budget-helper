# budget-helper

A simple app to assist in the process of categorizing and adding transaction data into budget spreadsheets.

## Status

Import, transfer reconciliation, the categorization card + review screen, and
local SQLite persistence are built. Spreadsheet sync is not started.

## Setup

```bash
npm install
cp config/accounts.example.json config/accounts.json   # then edit it
cp config/rules.example.json config/rules.json          # optional — auto-categorization
npm run dev
```

Then open http://localhost:3000. `config/accounts.json` and `config/rules.json`
are gitignored (account numbers, spreadsheet ids, employer names); each has a
committed `.example`. `config/categories.json` is committed — edit it directly to
change the taxonomy, or add entries from the Categorize screen (the app writes
back to this file).

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
credit in another. Two legs pair on opposite sign, equal amount, and dates
within `maxDaysApart`, plus any one of these counterparty signals (strongest
first): a shared bank **receipt number**, one leg naming the **other account's
number**, or both legs saying **"internal transfer"**. Pairs are labelled:

| `transferState` | When | Effect |
|---|---|---|
| `netted` | both accounts in the **same** group | dropped from the budget |
| `cross_group` | accounts in **different** groups (personal ↔ shared) | **kept** — so moving money into the shared account still shows in both budgets |
| `unmatched` | a strong transfer signal but no partner leg in the batch | kept, flagged for manual review |
| `none` | everything else (incl. a lone row that merely says "transfer") | untouched |

`maxDaysApart` defaults to 1 (same-bank transfers settle instantly).

## Categorization

After import the app steps through a three-stage flow (`Import → Categorize →
Review`, driven by `app/page.tsx`):

- **Categorize** — one card per transaction (netted transfers and rows a rule
  already categorized are excluded — undo those from Auto-review to hand-edit
  them). Pick a
  category, then a subcategory, via a keyboard-first filter box: type to narrow,
  `↑`/`↓` to move, `Enter` to pick. `⌥S` skips, `⌥F` flags, `⌥←` / `⌥→` move
  between cards. Picking a subcategory auto-advances. If your text matches nothing, a
  **Create "…"** row appears — selecting it adds the category/subcategory (a new
  category is written only once you name its first subcategory) and `POST`s it to
  `config/categories.json` so it sticks for later sessions. New entries append to
  the end; renaming/deleting is done by editing the file.
- **Review** — per-group (`personal` / `shared`) net totals broken down by
  category → subcategory, plus counts of skipped / pending / netted / cross-group
  rows, a list of skipped transactions, and a **Needs follow-up** section (see
  Flags). `Download CSV` is a stopgap until the `sink` exists.

## Flags & follow-up

During Auto-review and Categorize, **⚑ Flag** (`⌥F` on a card) opens a dialog to
tag a transaction for later. Flags live in their own `flag` table (schema v3),
are keyed by the content-hash transaction id, and **survive re-imports**. v1
kinds:

- **wrong account** — paid from the wrong account. Record which account it should
  have been, plus an optional note. Next batch, its correcting transfer shows up
  as new rows; in the review's follow-up section you pick that transfer to
  **link** it — the flag flips to *resolved* (`correctedByTxnId`), leaving a
  permanent record. `reopen` undoes the link.
- **note** — a free-text "needs action" reminder.

Flags are **annotation-only** — they never change the review totals. The review
screen's **Needs follow-up** card lists open/resolved wrong-account rows and all
notes, each removable.

- `POST /api/transactions/:id/flags` — `{ kind, data }`.
- `PATCH /api/flags/:id` — `{ data }`, `{ status: "resolved", correctedByTxnId? }`,
  or `{ status: "open" }`.
- `DELETE /api/flags/:id`.

Each response returns the affected transaction with its full flag list; the
client splices it in. Logic is in `lib/db/flags.ts` (tested vs `:memory:`);
`collectFollowUps` in `lib/transactions/summary.ts` builds the review buckets
(pure, tested).

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
- `DELETE /api/transactions` — the "Clear all data" escape hatch (also drops all flags).

`better-sqlite3` (synchronous); `serverExternalPackages` in `next.config.ts`
keeps the native addon unbundled. The connection singleton is in `lib/db/`;
query functions take an explicit `db` and are unit-tested against `:memory:`.

Aggregation logic lives in `lib/transactions/summary.ts` (pure, unit-tested);
the taxonomy is `config/categories.json`, read via `GET /api/categories` and
extended via `POST /api/categories` (`{ category, subcategory? }` — pure
`addToCategories` in `lib/categories/config.ts`, unit-tested).

## Auto-categorization

`config/rules.json` (gitignored; `.example` committed) holds an ordered list of
rules — **first match wins**, so order them most- to least-important:

```jsonc
{ "label": "Salary", "contains": "ACME PAYROLL", "direction": "credit",
  "minAmount": 1000, "category": "Income", "subcategory": "Salary" }
```

Each rule has exactly one of `contains` (case-insensitive substring) or `regex`
(case-insensitive), matched on the raw description; optional narrowing by
`direction`, `account`, and `minAmount`/`maxAmount` (on the *absolute* amount);
and a `category` + `subcategory` that must exist in `config/categories.json` (a
rule pointing elsewhere is skipped with a warning, not a hard error).

`POST /api/import` runs the rules over every `pending` row right after upsert and
sets matches to `status='categorized'`, `categorized_by='rule'`. If any matched,
the flow inserts an **Auto-review** step before Categorize showing the matches
grouped by rule, each with undo (→ back to `pending`) and a **Re-run rules**
button (`POST /api/rules/apply`). Re-runs only touch `pending` rows, so manual
and accepted categorizations are safe. Rows left approved here are considered
done and are dropped from the manual Categorize deck — undo one to hand-edit it.

**Making a rule mid-flow.** On the Categorize card, **＋ Rule** opens a dialog
pre-filled from the transaction on screen: match text (defaults to the
description — trim it to the stable part), category, and subcategory, with an
**Advanced options** panel for regex, direction, account, an absolute amount
range, and a label. Saving `POST`s to `/api/rules`, which appends the rule to
`config/rules.json` (created if absent) and immediately runs the whole ruleset
over the pending rows — matching rows leave the deck, and the card you were on is
claimed by the rule even if you'd already set it by hand. Set `BUDGET_RULES_PATH`
to point the loader/writer somewhere else (tests use this).

- `lib/rules/config.ts` — load + validate (`parseRulesConfig`, `validateRulesAgainstCategories`), pure/tested
- `lib/rules/apply.ts` — `applyRules(transactions, rules) → RuleMatch[]`, pure/tested
- `lib/rules/run.ts` — bridges the above to the DB over `pending` rows

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
  api/import/route.ts     POST files + accountIds -> parse, reconcile, upsert, auto-categorize
  api/transactions/route.ts             GET stored rows (+?status=) / DELETE all
  api/transactions/[id]/route.ts        PATCH one row (categorize / skip / undo)
  api/transactions/[id]/flags/route.ts  POST — add a flag to a transaction
  api/flags/[id]/route.ts               PATCH (edit / resolve / reopen) / DELETE a flag
  api/rules/route.ts               POST — append a rule + apply it now
  api/rules/apply/route.ts         POST — re-run rules over pending rows
components/
  ui/                     shadcn primitives (button, card, dialog, select, textarea, ...)
  AppHeader, Stepper, ImportStage, AutoReviewStage, CategorizeStage,
  TransactionCard, CategoryPicker, RuleDialog, FlagDialog, FlagChips,
  ReviewStage, FollowUpSection, StatCard
hooks/useCategories.ts    Fetch the taxonomy
hooks/useAccounts.ts      Fetch the account list
lib/utils.ts              cn() class-name helper
lib/format.ts             Money formatting
lib/db/
  index.ts                SQLite connection singleton (better-sqlite3)
  schema.ts               Schema + user_version migrations
  transactions.ts         Typed queries (upsert / list / setCategorization / applyRuleCategorizations / ...), tested vs :memory:
  flags.ts                Flag CRUD + resolve/reopen (wrong-account, notes), tested vs :memory:
lib/rules/
  config.ts               Load / validate / append / write config/rules.json (pure fns tested)
  apply.ts                applyRules(transactions, rules) -> RuleMatch[] (pure, tested)
  run.ts                  Run rules over the DB's pending rows
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
  rules.example.json      Template (committed)
  rules.json              Your auto-categorization rules (gitignored, optional)
```

## Adding another bank

Add a `BankProfile` to `lib/transactions/profiles.ts` and push it onto
`bankProfiles`. Detection is by exact header-row match; nothing else changes.

## Planned build order

1. ~~CSV import + parsing.~~ Done.
2. ~~Multi-account upload + inter-account transfer reconciliation.~~ Done.
3. ~~Per-transaction review card: assign category / subcategory, plus review screen.~~ Done.
4. ~~Persist transactions + categorizations locally (SQLite).~~ Done.
5. ~~Auto-categorization from `config/rules.json` + an auto-review step.~~ Done.
6. ~~Flags substrate + wrong-account / note flags + review follow-up section.~~ Done (Phase 1).
7. Reimbursement / split-expense tracking — a per-person claims/repayments ledger built on the flags substrate (design agreed; see notes).
8. Write categorized rows to a budget spreadsheet — Google Sheets first, Excel later, behind a common `sink` interface, one per group.
