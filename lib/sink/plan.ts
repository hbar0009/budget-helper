/**
 * The upsert: diff the rows we want against the rows already in the sheet and
 * work out the minimal set of writes.
 *
 * Pure and unit-tested — the Google Sheets adapter (`sheets.ts`) just executes
 * the plan this returns.
 */

import { SinkError, type SinkRow } from "./types.ts";

/** Canonical header, written on the first push. Column order in an existing
 *  sheet is free — rows are matched by the `id` column wherever it sits, and
 *  columns we don't recognise are left untouched. */
export const SINK_COLUMNS = [
  "id",
  "date",
  "description",
  "account",
  "category",
  "subcategory",
  "gross",
  "reimbursed",
  "net",
  "reimb_status",
  "owed_by",
] as const;

/** Spreadsheet cell value: a string, or a number for the money columns. */
export type Cell = string | number;

export interface SheetWritePlan {
  /** Present only when the sheet had no header row yet. */
  header?: string[];
  /** 1-based sheet row number -> its full replacement cells. */
  updates: { rowNumber: number; cells: Cell[] }[];
  /** New rows to append, in order. */
  appends: Cell[][];
  /** Rows already correct in the sheet. */
  unchanged: number;
}

const HEADER_ALIASES: Record<string, (typeof SINK_COLUMNS)[number]> = {
  "reimb status": "reimb_status",
  "reimbursement status": "reimb_status",
  "owed by": "owed_by",
  counterparty: "owed_by",
};

function canonicalHeader(name: string): string {
  const key = String(name ?? "").trim().toLowerCase();
  return HEADER_ALIASES[key] ?? key.replace(/\s+/g, "_");
}

function valueFor(column: string, row: SinkRow): Cell | undefined {
  switch (column) {
    case "id":
      return row.id;
    case "date":
      return row.date;
    case "description":
      return row.description;
    case "account":
      return row.account;
    case "category":
      return row.category;
    case "subcategory":
      return row.subcategory;
    case "gross":
      return row.gross;
    case "reimbursed":
      return row.reimbursed;
    case "net":
      return row.net;
    case "reimb_status":
      return row.reimbStatus;
    case "owed_by":
      return row.owedBy;
    default:
      return undefined;
  }
}

/** Same value once you ignore string/number representation and blank vs. absent. */
function sameCell(a: Cell | undefined, b: Cell | undefined): boolean {
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return Math.abs(na - nb) < 0.005;
  }
  return String(a ?? "").trim() === String(b ?? "").trim();
}

/**
 * `existing` is the sheet's current contents from `values.get` — row 0 is the
 * header (or the whole thing is empty). Rows are matched to `desired` by the
 * `id` column; a matched row with any changed cell becomes an update, an
 * unmatched `desired` row becomes an append, and cells under columns we don't
 * know are carried through untouched.
 */
export function planSheetWrite(
  existing: Cell[][],
  desired: SinkRow[],
): SheetWritePlan {
  const nonEmpty = existing.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

  if (nonEmpty.length === 0) {
    return {
      header: [...SINK_COLUMNS],
      updates: [],
      appends: desired.map((row) => SINK_COLUMNS.map((c) => valueFor(c, row) ?? "")),
      unchanged: 0,
    };
  }

  const header = existing[0].map((c) => String(c ?? ""));
  const columns = header.map(canonicalHeader);
  const idCol = columns.indexOf("id");
  if (idCol === -1) {
    throw new SinkError(
      "the sink sheet's header row has no `id` column — add one (see README) or clear the tab to let a push recreate it",
    );
  }

  const rowById = new Map<string, { rowNumber: number; cells: Cell[] }>();
  for (let i = 1; i < existing.length; i += 1) {
    const cells = existing[i] ?? [];
    const id = String(cells[idCol] ?? "").trim();
    if (id) rowById.set(id, { rowNumber: i + 1, cells });
  }

  const updates: SheetWritePlan["updates"] = [];
  const appends: Cell[][] = [];
  let unchanged = 0;

  for (const row of desired) {
    const current = rowById.get(row.id);
    const next: Cell[] = columns.map((col, i) => {
      const v = valueFor(col, row);
      if (v !== undefined) return v;
      return current?.cells[i] ?? ""; // keep the user's own column
    });

    if (!current) {
      appends.push(next);
      continue;
    }
    const changed = next.some((cell, i) => !sameCell(cell, current.cells[i]));
    if (changed) updates.push({ rowNumber: current.rowNumber, cells: next });
    else unchanged += 1;
  }

  return { updates, appends, unchanged };
}
