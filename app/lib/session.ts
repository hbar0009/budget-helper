/**
 * Stopgap persistence for an in-progress categorization session.
 *
 * Lives in `localStorage` so a refresh or accidental tab close doesn't wipe a
 * half-finished pass. The real store is SQLite (next feature); this is
 * deliberately dumb and will be replaced.
 */

import type { CategorizationMap } from "@/lib/transactions/summary";
import type { ReconciledTransaction } from "@/lib/transactions/types";

export type Stage = "import" | "categorize" | "review";

export interface Session {
  transactions: ReconciledTransaction[];
  categorizations: CategorizationMap;
  stage: Stage;
  index: number;
}

const KEY = "budget-helper:session:v1";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed || !Array.isArray(parsed.transactions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable or full — carry on in memory.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
