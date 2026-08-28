/**
 * CSV -> `ImportResult`.
 *
 * This module is server-only (it uses `node:crypto`). Call it from the
 * `/api/import` route, not from a client component.
 */

import Papa from "papaparse";
import { transactionId } from "./id.ts";
import { detectProfile } from "./profiles.ts";
import type { ImportResult } from "./types.ts";

/** Thrown when the file as a whole can't be imported (bad CSV, unknown format). */
export class CsvImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvImportError";
  }
}

export function parseCsv(text: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const profile = detectProfile(headers);
  if (!profile) {
    throw new CsvImportError(
      `Unrecognized statement format. Header row was: ${headers.join(", ") || "(empty)"}`,
    );
  }

  const result: ImportResult = {
    profileId: profile.id,
    transactions: [],
    errors: [],
  };

  // Structural problems Papa itself flagged (ragged rows, stray quotes).
  for (const err of parsed.errors) {
    if (typeof err.row === "number") {
      result.errors.push({
        row: err.row + 1,
        message: err.message,
        raw: parsed.data[err.row] ?? {},
      });
    }
  }

  parsed.data.forEach((row, index) => {
    try {
      const fields = profile.parseRow(row);
      result.transactions.push({
        id: transactionId(profile.id, fields),
        date: fields.date,
        description: fields.description,
        amount: round2(fields.amount),
        direction: fields.amount < 0 ? "debit" : "credit",
        balance: fields.balance === null ? null : round2(fields.balance),
      });
    } catch (err) {
      result.errors.push({
        row: index + 1,
        message: err instanceof Error ? err.message : String(err),
        raw: row,
      });
    }
  });

  return result;
}

/** Guard against floating-point noise from currency arithmetic. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
