"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Collapsed "Danger zone" holding the full data wipe. Deleting is gated behind
 * typing the confirm word so it can't happen on a stray click — the DB is the
 * whole budget history now, not a scratch buffer.
 */
export default function DangerZone() {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirm.trim().toUpperCase() === "DELETE";

  async function wipe() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", { method: "DELETE" });
      if (!res.ok) throw new Error();
      window.location.href = "/";
    } catch {
      setError("Could not delete. Nothing was changed.");
      setBusy(false);
    }
  }

  return (
    <details className="border-destructive/30 rounded-lg border">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-4 py-2 text-sm font-medium">
        Danger zone
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        <p className="text-muted-foreground text-sm">
          Permanently delete every imported transaction, categorization, flag,
          claim and repayment from this profile&apos;s database. Your spreadsheets
          are not touched. This cannot be undone.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="w-56"
            aria-label="Type DELETE to confirm"
          />
          <Button
            variant="destructive"
            disabled={!ready || busy}
            onClick={wipe}
          >
            {busy ? "Deleting…" : "Clear all data"}
          </Button>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
    </details>
  );
}
