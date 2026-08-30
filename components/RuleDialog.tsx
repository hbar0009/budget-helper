"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import CategoryPicker from "@/components/CategoryPicker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/lib/categories/config";
import { formatSigned } from "@/lib/format";
import { applyRules } from "@/lib/rules/apply";
import type { Rule } from "@/lib/rules/config";
import type { ReconciledTransaction } from "@/lib/transactions/types";

/** The body `POST /api/rules` expects. */
export interface RuleInput {
  label?: string;
  contains?: string;
  regex?: string;
  direction?: "credit" | "debit";
  account?: string;
  minAmount?: number;
  maxAmount?: number;
  category: string;
  subcategory: string;
  currentTransactionId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The card the rule is being spun off from. */
  transaction: ReconciledTransaction;
  categories: Category[];
  initialCategory: string | null;
  initialSubcategory: string | null;
  /** Deck rows still awaiting a decision — drives the "matches N" preview. */
  remainingPending: ReconciledTransaction[];
  onSubmit: (rule: RuleInput) => Promise<{ ok: boolean; error?: string }>;
}

const DIRECTIONS = [
  ["", "Any"],
  ["debit", "Money out"],
  ["credit", "Money in"],
] as const;

/**
 * Turn the transaction on screen into a reusable auto-categorization rule. The
 * minimal form is match text + category + subcategory; "Advanced options" opens
 * the full narrowing suite (regex, direction, account, amount range, label).
 */
export default function RuleDialog({
  open,
  onOpenChange,
  transaction,
  categories,
  initialCategory,
  initialSubcategory,
  remainingPending,
  onSubmit,
}: Props) {
  const [mode, setMode] = useState<"contains" | "regex">("contains");
  const [matchText, setMatchText] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [direction, setDirection] = useState<"" | "credit" | "debit">("");
  const [scopeAccount, setScopeAccount] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reseed each time the dialog opens for a card.
  useEffect(() => {
    if (!open) return;
    setMode("contains");
    setMatchText(transaction.description.trim());
    setCategory(initialCategory ?? "");
    setSubcategory(initialSubcategory ?? "");
    setAdvanced(false);
    setDirection("");
    setScopeAccount(false);
    setMinAmount("");
    setMaxAmount("");
    setLabel("");
    setSubmitting(false);
    setError(null);
  }, [open, transaction.id, transaction.description, initialCategory, initialSubcategory]);

  const categoryNames = categories.map((c) => c.name);
  const subOptions =
    categories.find((c) => c.name.toLowerCase() === category.trim().toLowerCase())
      ?.subcategories ?? [];

  const min = Number.parseFloat(minAmount);
  const max = Number.parseFloat(maxAmount);
  const amountInvalid =
    (minAmount.trim() !== "" && !(min >= 0)) ||
    (maxAmount.trim() !== "" && !(max >= 0)) ||
    (Number.isFinite(min) && Number.isFinite(max) && min > max);

  const draftRule = useMemo<Rule>(
    () => ({
      contains: mode === "contains" ? matchText.trim() : undefined,
      regex: mode === "regex" ? matchText.trim() : undefined,
      direction: direction || undefined,
      account: scopeAccount ? transaction.accountId : undefined,
      minAmount: Number.isFinite(min) ? min : undefined,
      maxAmount: Number.isFinite(max) ? max : undefined,
      category: category.trim() || "—",
      subcategory: subcategory.trim() || "—",
    }),
    [
      mode,
      matchText,
      direction,
      scopeAccount,
      transaction.accountId,
      min,
      max,
      category,
      subcategory,
    ],
  );

  const preview = useMemo(() => {
    if (!matchText.trim()) return { kind: "empty" as const };
    try {
      return {
        kind: "ok" as const,
        n: applyRules(remainingPending, [draftRule]).length,
      };
    } catch {
      return { kind: "badRegex" as const };
    }
  }, [matchText, draftRule, remainingPending]);

  const canSubmit =
    !submitting &&
    matchText.trim().length > 0 &&
    preview.kind !== "badRegex" &&
    category.trim().length > 0 &&
    subcategory.trim().length > 0 &&
    !amountInvalid;

  async function handleSave() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await onSubmit({
      label: label.trim() || undefined,
      contains: mode === "contains" ? matchText.trim() : undefined,
      regex: mode === "regex" ? matchText.trim() : undefined,
      direction: direction || undefined,
      account: scopeAccount ? transaction.accountId : undefined,
      minAmount: Number.isFinite(min) ? min : undefined,
      maxAmount: Number.isFinite(max) ? max : undefined,
      category: category.trim(),
      subcategory: subcategory.trim(),
      currentTransactionId: transaction.id,
    });
    setSubmitting(false);
    if (res.ok) onOpenChange(false);
    else setError(res.error ?? "Could not save the rule.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New auto-categorization rule</DialogTitle>
          <DialogDescription>
            Appended to <code>config/rules.json</code> and applied to the rest of
            this batch right away.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-match">
              {mode === "contains"
                ? "When the description contains"
                : "When the description matches (regex)"}
            </Label>
            <Input
              id="rule-match"
              autoFocus
              value={matchText}
              onChange={(e) => setMatchText(e.target.value)}
              placeholder={mode === "contains" ? "e.g. SPOTIFY" : "e.g. RENT.*PROPERTY"}
            />
            <p className="text-muted-foreground truncate text-xs">
              From: {transaction.description}
            </p>
          </div>

          <CategoryPicker
            label="Category"
            options={categoryNames}
            value={category || null}
            autoFocus={false}
            onPick={(c) => {
              setCategory(c);
              setSubcategory("");
            }}
          />
          <CategoryPicker
            key={category}
            label="Subcategory"
            options={subOptions}
            value={subcategory || null}
            autoFocus={false}
            onPick={setSubcategory}
          />

          <div>
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
            >
              {advanced ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
              Advanced options
            </button>

            {advanced && (
              <div className="mt-3 space-y-4 border-l pl-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-current"
                    checked={mode === "regex"}
                    onChange={(e) =>
                      setMode(e.target.checked ? "regex" : "contains")
                    }
                  />
                  Treat match text as a regular expression
                </label>

                <div className="space-y-1.5">
                  <Label>Direction</Label>
                  <div className="flex gap-1">
                    {DIRECTIONS.map(([value, text]) => (
                      <Button
                        key={value || "any"}
                        type="button"
                        size="sm"
                        variant={direction === value ? "default" : "outline"}
                        onClick={() => setDirection(value)}
                      >
                        {text}
                      </Button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-current"
                    checked={scopeAccount}
                    onChange={(e) => setScopeAccount(e.target.checked)}
                  />
                  Only in{" "}
                  <span className="font-medium">{transaction.accountId}</span>
                </label>

                <div className="space-y-1.5">
                  <Label>Amount range (absolute)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      placeholder="min"
                      className="w-24"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      inputMode="decimal"
                      placeholder="max"
                      className="w-24"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                    />
                    <span className="text-muted-foreground text-xs">
                      this one: {formatSigned(transaction.amount)}
                    </span>
                  </div>
                  {amountInvalid && (
                    <p className="text-destructive text-xs">
                      Use non-negative numbers with min ≤ max.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rule-label">Label (optional)</Label>
                  <Input
                    id="rule-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Shown on the auto-review screen"
                  />
                </div>
              </div>
            )}
          </div>

          <p className="text-sm">
            {preview.kind === "empty" && (
              <span className="text-muted-foreground">Enter text to match.</span>
            )}
            {preview.kind === "badRegex" && (
              <span className="text-destructive">
                That regular expression doesn’t compile.
              </span>
            )}
            {preview.kind === "ok" && (
              <span className="text-muted-foreground">
                Auto-categorizes{" "}
                <span className="text-foreground font-medium">{preview.n}</span>{" "}
                of {remainingPending.length} uncategorized transaction
                {remainingPending.length === 1 ? "" : "s"}.
              </span>
            )}
          </p>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit}>
            {submitting ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
