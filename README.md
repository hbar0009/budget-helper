# budget-helper

A simple app to assist in the process of categorizing and adding transaction data into budget spreadsheets.

## Status

Import, transfer reconciliation, the categorization card + review screen, local
SQLite persistence, the Google Sheets sink, and the Analysis view (history by
month, with charts) are built. Budget targets are next.

## Setup

```bash
npm install
mkdir -p data/prod/config
cp config/accounts.example.json      data/prod/config/accounts.json         # then edit it
cp config/categories.example.json    data/prod/config/categories.json       # starting taxonomy
cp config/rules.example.json         data/prod/config/rules.json            # optional — auto-categorization
cp config/service-account.example.json data/prod/config/service-account.json # optional — Google Sheets push
npm run build && npm start
```

Then open http://localhost:3000. The live config and database live under
`data/<profile>/` — `prod` for real use, `dev` for feature work (see
[Dev vs prod](#dev-vs-prod)). Everything under `data/` is gitignored (account
numbers, spreadsheet ids, employer names, your transaction record); `config/`
holds only the committed `*.example.json` templates. Add categories from the
Categorize screen too — the app writes back to the profile's `categories.json`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server + hot reload, on the **`dev`** profile |
| `npm run build` | Production build |
| `npm start` | Serve the production build, on the **`prod`** profile |
| `npm run seed:dev` | Reset `data/dev/` to a fresh copy of `data/prod/` |
| `npm run lint` | Lint |
| `npm test` | Run unit tests (`node --test`) |

## Dev vs prod

`BUDGET_PROFILE` selects a data profile so feature work never risks your real
transaction record. Everything stateful — the SQLite database **and** the
mutable configs (`accounts`, `categories`, `rules`, `service-account`) — lives
under `data/<profile>/`:

| Profile | Set by | State dir |
|---|---|---|
| `dev` | `npm run dev` | `data/dev/` |
| `prod` | `npm start` (and the default for anything else, incl. tests) | `data/prod/` |

`npm run seed:dev` wipes `data/dev/` and recursively copies `data/prod/` into
it, so dev starts from a realistic snapshot. After seeding, point
`data/dev/config/accounts.json` at fake account numbers and a dev/bogus sink so
a stray **Push to Sheets** in dev can't reach your real spreadsheets.

Resolution order for each path (`lib/config/paths.ts`): an explicit
`BUDGET_DB_PATH` / `BUDGET_RULES_PATH` / `BUDGET_ACCOUNTS_PATH` /
`BUDGET_CATEGORIES_PATH` / `BUDGET_GOOGLE_KEY_PATH` wins (this is how the unit
tests stay isolated); otherwise it's `data/<profile>/…`.

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

The app has two areas, switched from the header: **Work** (`/`) — the
import/categorize/review pipeline below — and **Analysis** (`/analysis`, see
[Analysis](#analysis)). Imported transactions accumulate in the database across
every import; the Stepper's **Import** step is reachable any time to add another
statement without discarding what's there.

The Work flow steps through `Import → Categorize → Review` (`app/page.tsx`):

- **Categorize** — one card per transaction (netted transfers and rows a rule
  already categorized are excluded — undo those from Auto-review to hand-edit
  them). Pick a
  category, then a subcategory, via a keyboard-first filter box: type to narrow,
  `↑`/`↓` to move, `Enter` to pick. `⌥S` skips, `⌥F` flags, `⌥P` splits,
  `⌥R` links a repayment (on a credit), `⌥←` / `⌥→` move between cards. Picking a
  subcategory auto-advances. If your text matches nothing, a
  **Create "…"** row appears — selecting it adds the category/subcategory (a new
  category is written only once you name its first subcategory) and `POST`s it to
  the profile's `categories.json` so it sticks for later sessions. New entries
  append to the end; renaming/deleting is done by editing the file.
- **Review** — per-group (`personal` / `shared`) net totals broken down by
  category → subcategory, plus counts of skipped / pending / netted / cross-group
  rows, a list of skipped transactions, and a **Needs follow-up** section (see
  Flags). Once there's more than one import, the category totals **scope to one
  import batch at a time** (rows sharing an `imported_at`; default the latest,
  switchable) so "did this import categorize right?" stays focused — follow-ups
  and reimbursements stay global. **Push to Sheets** writes the categorized rows
  to each group's sink (see Sinks); `Download CSV` is an offline alternative.

## Analysis

`/analysis` browses the accumulated history. Pick a **calendar month**
(‹ prev / next › or the dropdown) or a **custom date range**; per group you get
income / expense / net for the period, the category → subcategory breakdown
(same aggregation as Review), and a **Δ vs previous month** column. An **Every
month** table lists net per group per month (click a row to jump the picker). A
collapsed **Danger zone** at the bottom holds the full data wipe (`DELETE
/api/transactions`), gated behind typing `DELETE`.

**Charts** (Recharts, `components/charts/`) — each group card has a tab strip,
one chart at a time, the breakdown table below:

| Tab | Chart |
|---|---|
| Category | horizontal bars, biggest spend first, for the selected period (one hue) |
| Over time | net per month, coloured by sign, zero baseline; click a month to select it |
| In vs out | income above / expense below the baseline, per month |
| Composition | monthly spend as a stacked area of the top 6 categories + "Other" |

Colours are the validated data-viz palette as `--chart-*` custom properties in
`app/globals.css` (referenced straight in SVG, so dark mode swaps for free).
Read-only — categorizing still happens in the Work flow. Pure helpers in
`lib/transactions/summary.ts` (`monthKey` / `listMonths` / `filterByPeriod` /
`monthPeriod` / `periodTotals` / `perMonthTotals` / `monthlyInOut` /
`monthlyExpenseByCategory` / `listImportBatches`, all unit-tested).

## Flags & follow-up

During Auto-review and Categorize, **⚑ Flag** (`⌥F` on a card) opens a dialog to
tag a transaction for later. Flags live in their own `flag` table (schema v3),
are keyed by the content-hash transaction id, and **survive re-imports**. v1
kinds:

- **wrong account** — paid from the wrong account. The "should have been" target
  is the *other* account money is spent from (accounts with `spending: true` in
  `accounts.json`); when that's a single account it's filled in automatically and
  a picker appears only if it's ambiguous. Add an optional note. Next batch, its
  correcting transfer shows up
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

## Reimbursements — who owes you

When you front an expense for other people, **➗ Split** (`⌥P` on a card) opens a
dialog: add a row per person with the amount they owe, or use the **even split**
helper (`total ÷ N people incl. you`). Each row becomes a `reimbursement_claim`
row (schema v4) — `person`, `expected` (nullable = "TBD"), `status`
(`open` / `settled` / `written_off`), `followed_up_at`. Claims are keyed by the
content-hash transaction id and **survive re-imports**, so a repayment that lands
months later still finds its claim.

The fronted debit is still categorized as the normal expense it is (claims are
**annotation-only** — the budget totals stay gross). The review screen's **Owed
to you** card groups open claims by person with a total to chase; per claim you
can toggle *followed up*, *mark settled*, or *write off* (and *reopen*).

**Repayments.** When a friend pays you back, link the incoming credit to their
claim(s): **↩ Repayment** (`⌥R`) on a candidate credit card in the deck (a
candidate is an incoming credit with `transfer_state` `none` / `unmatched`) opens
a dialog that lists open claims by person — tick the people this credit covers.
The review's *Owed to you* card also has a per-claim recorder (pick a candidate
credit, or **cash** for money handed over outside the bank). Each becomes a
`reimbursement_repayment` row (schema v5) — `claim_id`, `txn_id` (null = cash),
`amount`. Derived per claim: `repaid = Σ repayments`, `outstanding = expected −
repaid`; a repayment that clears the balance **auto-settles** the claim (deleting
one never auto-reopens it). A **Possible repayments** list at the top of the
section surfaces unlinked candidate credits whose amount matches an open claim's
outstanding.

- `POST /api/transactions/:id/claims` — `{ claims: [{ person, expected?, note? }] }`.
- `PATCH /api/claims/:id` — `{ person?, expected?, note? }`, `{ status }`,
  `{ followedUp: boolean }`.
- `DELETE /api/claims/:id`.
- `POST /api/transactions/:id/repayments` — `{ repayments: [{ claimId, amount }] }`
  (one credit split across several claims).
- `POST /api/claims/:id/repayments` — `{ txnId: string | null, amount }`
  (single; `txnId: null` = cash).
- `DELETE /api/repayments/:id`.

Logic in `lib/db/reimbursements.ts` (tested vs `:memory:`); `collectReimbursements`
in `lib/transactions/summary.ts` rolls claims up by person and computes the
repayment hints (pure, tested).

## Sinks — push to a spreadsheet

The **Push to Sheets** button on the Review screen (`POST /api/sink/push`) writes
each group's categorized rows to the `sink` configured for it in
`config/accounts.json`. `kind` picks the implementation — `google-sheets` today,
`excel` later — behind the common `Sink` interface in `lib/sink/`.

**What gets pushed.** One row per transaction that is *categorized*,
*budget-relevant* (netted transfers stay out), and *not itself a repayment
credit* (its money is already folded into the fronted debit's `net`, so a row of
its own would double-count). Skipped and pending rows are held back.

**Columns** (`id · date · description · account · category · subcategory · gross ·
reimbursed · net · reimb_status · owed_by`). For a plain transaction `gross ==
net`, `reimbursed` is 0, and the last two are blank. When the transaction has
reimbursement claims, `reimbursed` is how much has actually been **repaid** so
far (offsetting `gross` toward zero), `net = gross + reimbursed`, `reimb_status`
is `open` / `partial` / `settled`, and `owed_by` lists the people.

**Re-push is an upsert.** Rows are matched by the `id` column, so pushing again
after categorizing more — or after a repayment lands weeks later — updates the
changed rows in place and appends the new ones. Nothing is ever deleted. The
first push writes the header row; after that you can reorder columns or add your
own to the right and they're preserved (the `id` column just has to stay). Each
group is pushed independently, so one failing (bad config, auth) still pushes the
other and the response reports per-group `{ added, updated, unchanged }` or
`{ error }`.

**Auth.** A Google service-account key JSON at
`data/<profile>/config/service-account.json` (copy
`config/service-account.example.json` there, override the path with
`BUDGET_GOOGLE_KEY_PATH`). In Google Cloud: create a service account, enable the
Google Sheets API, add a JSON key; then **share each target spreadsheet with the
key's `client_email`** as an Editor. `spreadsheetId` and `tab` go in the group's
`sink` block.

- `lib/sink/rows.ts` — `buildSinkRowsByGroup(transactions, accounts)` (pure, tested)
- `lib/sink/plan.ts` — `planSheetWrite(existing, desired)` → the minimal set of
  header / update / append writes (pure, tested — this is the upsert)
- `lib/sink/sheets.ts` — the Sheets v4 REST adapter (`google-auth-library` + `fetch`)
- `lib/sink/index.ts` — `sinkFor(sinkConfig)` on `kind`

## Persistence

Imported transactions and their categorizations live in a local SQLite database
(`data/<profile>/budget-helper.db`, gitignored; see [Dev vs prod](#dev-vs-prod),
override the path with `BUDGET_DB_PATH`).
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
the taxonomy is `data/<profile>/config/categories.json` (seeded from the
committed `config/categories.example.json`), read via `GET /api/categories` and
extended via `POST /api/categories` (`{ category, subcategory? }` — pure
`addToCategories` in `lib/categories/config.ts`, unit-tested).

## Auto-categorization

`data/<profile>/config/rules.json` (seeded from the committed
`config/rules.example.json`) holds an ordered list of rules — **first match
wins**, so order them most- to least-important:

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
the profile's `rules.json` (created if absent) and immediately runs the whole ruleset
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

## Config: `accounts.json`

Lives at `data/<profile>/config/accounts.json` (seeded from
`config/accounts.example.json`; override with `BUDGET_ACCOUNTS_PATH`).

- `accounts[]` — `id`, `label`, `number` (drives transfer detection), `type`,
  `group`, and optional `spending` (bool — is money paid out of this account?
  drives the "wrong account" flag's candidate list; defaults to
  `type === "everyday"`)
- `groups{}` — one entry per group, each with a `sink` describing where that
  group's data is written. `kind` picks the implementation; for
  `google-sheets` the rest is `spreadsheetId` + `tab` (see Sinks). `excel` is
  not implemented yet.

## Layout

```
app/
  layout.tsx              Root layout — env banner + AppHeader (Work / Analysis nav)
  page.tsx                Work flow orchestrator (client): loads from the DB, picks the stage
  analysis/page.tsx       Analysis view (client): history by month / range
  globals.css             Tailwind v4 + shadcn theme tokens (OS light/dark)
  api/accounts/route.ts   GET the account list for the UI
  api/categories/route.ts GET the taxonomy / POST a new category or subcategory
  api/import/route.ts     POST files + accountIds -> parse, reconcile, upsert, auto-categorize
  api/transactions/route.ts             GET stored rows (+?status=) / DELETE all
  api/transactions/[id]/route.ts        PATCH one row (categorize / skip / undo)
  api/transactions/[id]/flags/route.ts      POST — add a flag to a transaction
  api/transactions/[id]/claims/route.ts     POST — add reimbursement claims (a split)
  api/transactions/[id]/repayments/route.ts POST — link one credit to several claims
  api/flags/[id]/route.ts                   PATCH (edit / resolve / reopen) / DELETE a flag
  api/claims/[id]/route.ts                  PATCH (edit / settle / write off / followed-up) / DELETE
  api/claims/[id]/repayments/route.ts       POST — record a repayment (credit or cash)
  api/repayments/[id]/route.ts              DELETE — unlink a repayment
  api/rules/route.ts               POST — append a rule + apply it now
  api/rules/apply/route.ts         POST — re-run rules over pending rows
  api/sink/push/route.ts           POST — push each group's rows to its sink spreadsheet
components/
  ui/                     shadcn primitives (button, card, dialog, select, textarea, ...)
  AppHeader, EnvBanner, Stepper, ImportStage, AutoReviewStage, CategorizeStage,
  TransactionCard, CategoryPicker, RuleDialog, FlagDialog, FlagChips,
  SplitDialog, RepaymentDialog, ReimbursementChip, ReviewStage,
  FollowUpSection, ReimbursementSection, StatCard,
  AnalysisView, DangerZone
  charts/  chartTheme, ChartTooltip, GroupChartPanel,
           CategoryBarChart, NetOverTimeChart, InOutChart, CompositionAreaChart
hooks/useCategories.ts    Fetch the taxonomy
hooks/useAccounts.ts      Fetch the account list
scripts/seed-dev.ts       Reset data/dev/ to a copy of data/prod/
lib/config/paths.ts       BUDGET_PROFILE -> db + config paths (dev/prod), env overrides
lib/utils.ts              cn() class-name helper
lib/format.ts             Money formatting
lib/db/
  index.ts                SQLite connection singleton (better-sqlite3)
  schema.ts               Schema + user_version migrations
  transactions.ts         Typed queries (upsert / list / setCategorization / applyRuleCategorizations / ...), tested vs :memory:
  flags.ts                Flag CRUD + resolve/reopen (wrong-account, notes), tested vs :memory:
  reimbursements.ts       Claim + repayment CRUD (per-person "owes you", auto-settle), tested vs :memory:
lib/rules/
  config.ts               Load / validate / append / write the profile's rules.json (pure fns tested)
  apply.ts                applyRules(transactions, rules) -> RuleMatch[] (pure, tested)
  run.ts                  Run rules over the DB's pending rows
lib/accounts/
  config.ts               Load / parse / validate the profile's accounts.json (+ isSpendingAccount), tested
lib/sink/
  rows.ts                 buildSinkRowsByGroup(transactions, accounts) -> per-group SinkRow[] (pure, tested)
  plan.ts                 planSheetWrite(existing, desired) -> minimal header/update/append writes (the upsert; pure, tested)
  sheets.ts               google-sheets sink: Sheets v4 REST via google-auth-library + fetch
  index.ts                sinkFor(sinkConfig) -> Sink, on `kind`
lib/categories/
  config.ts               Load / validate / mutate / write the profile's categories.json (pure fns tested)
lib/transactions/
  types.ts                Canonical shapes for each pipeline stage
  id.ts                   Content-hash helper for row ids
  profiles.ts             Per-bank CSV quirks + header-match detection
  parse.ts                Stage 1: CSV -> ParsedTransaction[]
  assign.ts               Stage 2: attach account
  reconcile.ts            Stage 3: classify inter-account transfers
  summary.ts              Deck filtering + review aggregation (pure)
  *.test.ts               Unit tests
config/                   committed templates only
  accounts.example.json
  categories.example.json  Starting category / subcategory taxonomy
  rules.example.json
  service-account.example.json
data/                     gitignored — one dir per profile (see Dev vs prod)
  prod/
    budget-helper.db      Your transaction record (SQLite)
    config/
      accounts.json  categories.json  rules.json  service-account.json
  dev/                    same shape; `npm run seed:dev` fills it from prod/
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
7. ~~Reimbursement / split-expense tracking — per-person claims on a fronted debit, repayment linking (bank credit or cash), auto-settle, "Owed to you" review with repayment hints.~~ Done (Parts A + B).
8. ~~Write categorized rows to a budget spreadsheet — Google Sheets first, Excel later, behind a common `sink` interface, one per group.~~ Done (Google Sheets; upsert by transaction id).
9. In-app budgeting + data viz, phased:
   - **A** — ~~history + month/range Analysis view; Review scoped to the latest import batch.~~ Done.
   - **B** — ~~charts on the Analysis view (category / net-over-time / in-vs-out / stacked composition), Recharts.~~ Done.
   - **C** — budget targets per category per month, with actual-vs-target.
   - **D** — (undecided) recurring/subscription detection, forecasting, net worth from balances.
