# budget-helper

A simple app to assist in the process of categorizing and adding transaction data into budget spreadsheets.

## Status

Scaffold only — a bare Next.js (App Router, TypeScript) app. None of the systems are built yet.

## Running

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | Lint |

## Layout

```
app/
  layout.tsx    Root layout (<html>/<body>, metadata)
  page.tsx      Home page
  globals.css   Global styles
next.config.ts  Next.js config
tsconfig.json   TypeScript config
```

## Planned build order

1. CSV import.
2. Per-transaction review card: assign category / subcategory.
3. Write categorized rows to a budget spreadsheet — Google Sheets first, Excel later, behind a common interface.
