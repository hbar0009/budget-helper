/**
 * Bank profiles.
 *
 * Each bank exports CSV a little differently — different column names, date
 * formats, and sign conventions. A `BankProfile` isolates all of that. To
 * support a new bank, add a profile here; nothing else needs to change.
 */

/** The normalized fields a profile is responsible for extracting from one row. */
export interface RawFields {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  description: string;
  /** Signed: negative = money out, positive = money in. */
  amount: number;
  balance: number | null;
}

export interface BankProfile {
  id: string;
  label: string;
  /**
   * Exact header cells expected, in order. Used to auto-detect which profile a
   * given CSV belongs to.
   */
  headers: string[];
  /** Pull normalized fields out of one parsed row. Throw `Error` on bad data. */
  parseRow(row: Record<string, string>): RawFields;
}

/** `DD/MM/YYYY` -> `YYYY-MM-DD`. */
function parseAustralianDate(value: string): string {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Unrecognized date "${value}" (expected DD/MM/YYYY)`);
  }
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a currency cell to a number. Returns `NaN` for an empty cell (callers
 * treat that as "column not present for this row"); throws on genuine garbage.
 */
function parseAmount(value: string): number {
  const cleaned = value.trim().replace(/[$,]/g, "");
  if (cleaned === "") return NaN;
  const n = Number(cleaned);
  if (Number.isNaN(n)) {
    throw new Error(`Unrecognized amount "${value}"`);
  }
  return n;
}

/**
 * ING (Australia) transaction export — matched purely by its header row:
 * `Date,Description,Credit,Debit,Balance`.
 *
 * Each row populates exactly one of Credit / Debit. Credit is money in, Debit
 * is money out (already written with a minus sign in the sample data).
 */
export const ingOrangeEveryday: BankProfile = {
  id: "ing-orange-everyday",
  label: "ING Orange Everyday",
  headers: ["Date", "Description", "Credit", "Debit", "Balance"],
  parseRow(row) {
    const credit = parseAmount(row.Credit ?? "");
    const debit = parseAmount(row.Debit ?? "");
    const hasCredit = !Number.isNaN(credit);
    const hasDebit = !Number.isNaN(debit);

    if (hasCredit === hasDebit) {
      throw new Error(
        `Expected exactly one of Credit / Debit to be set ` +
          `(Credit="${row.Credit ?? ""}", Debit="${row.Debit ?? ""}")`,
      );
    }

    // Normalize the sign ourselves rather than trusting the source column.
    const amount = hasCredit ? Math.abs(credit) : -Math.abs(debit);
    const balance = parseAmount(row.Balance ?? "");

    return {
      date: parseAustralianDate(row.Date ?? ""),
      description: (row.Description ?? "").trim(),
      amount,
      balance: Number.isNaN(balance) ? null : balance,
    };
  },
};

export const bankProfiles: BankProfile[] = [ingOrangeEveryday];

/** Find the profile whose header row matches this CSV's, or `null`. */
export function detectProfile(headers: string[]): BankProfile | null {
  const normalized = headers.map((h) => h.trim());
  return (
    bankProfiles.find(
      (profile) =>
        profile.headers.length === normalized.length &&
        profile.headers.every((h, i) => h === normalized[i]),
    ) ?? null
  );
}
