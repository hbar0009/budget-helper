# budget-helper

A simple app to assist in the process of categorizing and adding transaction data into budget spreadsheets.

## Status

Import, transfer reconciliation, and the categorization card + review screen are
built. Persistence is a `localStorage` stopgap; spreadsheet sync is not started.

## Setup

```bash
npm install
cp config/accounts.example.json config/accounts.json   # then edit it
npm run dev
```

Then open http://localhost:3000. `config/accounts.json` is gitignored (it holds
your account numbers and spreadsheet ids); the `.example` is the template.
`config/categories.json` is committed — edit it directly to change the taxonomy.

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
  Picking a subcategory auto-advances.
- **Review** — per-group (`personal` / `shared`) net totals broken down by
  category → subcategory, plus counts of skipped / pending / netted / cross-group
  rows and a list of skipped transactions to follow up. `Download CSV` is a
  stopgap until the `sink` exists.

Progress (transactions + categorizations + current position) is saved to
`localStorage` so a refresh doesn't lose a half-finished pass — this is
throwaway once SQLite lands. `Start over` clears it.

Aggregation logic lives in `lib/transactions/summary.ts` (pure, unit-tested);
the taxonomy is `config/categories.json`, served via `/api/categories`.

## Config: `config/accounts.json`

- `accounts[]` — `id`, `label`, `number` (drives transfer detection), `type`, `group`
- `groups{}` — one entry per group, each with a `sink` describing where that
  group's data is written. The `sink` is not wired up yet; `kind` picks the
  implementation (`google-sheets`, later `excel`), the rest is passed through.

## Layout

```
app/
  layout.tsx              Root layout
  page.tsx                Flow orchestrator (client): Import -> Categorize -> Review
  globals.css             Design tokens (light/dark) + component styles
  components/             AppHeader, Stepper, ImportStage, CategorizeStage,
                          TransactionCard, CategoryPicker, ReviewStage
  hooks/useCategories.ts  Fetch the taxonomy
  lib/session.ts          localStorage save/restore (stopgap)
  api/accounts/route.ts   GET the account list for the UI
  api/categories/route.ts GET the category taxonomy
  api/import/route.ts     POST files + accountIds -> MultiImportResult (parse + reconcile)
lib/accounts/
  config.ts               Load + validate config/accounts.json
lib/categories/
  config.ts               Load + validate config/categories.json (parse fn is pure/tested)
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
4. Persist categorized transactions locally (SQLite) — replaces the `localStorage` stopgap.
5. Write categorized rows to a budget spreadsheet — Google Sheets first, Excel later, behind a common `sink` interface, one per group.
6. Reimbursement / split-expense tracking (design agreed; see notes).
