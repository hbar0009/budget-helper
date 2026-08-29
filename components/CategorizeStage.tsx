"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import CategoryPicker from "@/components/CategoryPicker";
import TransactionCard from "@/components/TransactionCard";
import { useCategories } from "@/hooks/useCategories";
import { budgetDeck, type CategorizationMap } from "@/lib/transactions/summary";
import type { ReconciledTransaction } from "@/lib/transactions/types";

interface Props {
  transactions: ReconciledTransaction[];
  categorizations: CategorizationMap;
  index: number;
  onIndexChange: (index: number) => void;
  onCategorize: (
    id: string,
    value: { category: string; subcategory: string } | null,
  ) => void;
  onComplete: () => void;
}

export default function CategorizeStage({
  transactions,
  categorizations,
  index,
  onIndexChange,
  onCategorize,
  onComplete,
}: Props) {
  const { categories, error, addCategory } = useCategories();
  const deck = useMemo(() => budgetDeck(transactions), [transactions]);

  const [step, setStep] = useState<"category" | "subcategory">("category");
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const current: ReconciledTransaction | undefined = deck[index];
  const existing = current ? categorizations[current.id] : undefined;

  // Landing on a card: seed the picker from any categorization it already has.
  useEffect(() => {
    if (existing) {
      setPendingCategory(existing.category);
      setStep("subcategory");
    } else {
      setPendingCategory(null);
      setStep("category");
    }
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  const goto = useCallback(
    (next: number) => {
      onIndexChange(Math.max(0, Math.min(deck.length, next)));
    },
    [deck.length, onIndexChange],
  );

  const skip = useCallback(() => {
    if (!current) return;
    onCategorize(current.id, null);
    goto(index + 1);
  }, [current, onCategorize, goto, index]);

  const chooseCategory = useCallback((name: string) => {
    setPendingCategory(name);
    setStep("subcategory");
    setSaveError(null);
  }, []);

  const changeCategory = useCallback(() => {
    setStep("category");
    setPendingCategory(null);
    setSaveError(null);
  }, []);

  /** Finalize the current card. Persists the category/subcategory first if
   *  either is new. */
  const commitSubcategory = useCallback(
    async (subcategory: string) => {
      if (!current || !pendingCategory) return;
      const sub = subcategory.trim();
      if (!sub) return;

      const known = categories?.find(
        (c) => c.name.toLowerCase() === pendingCategory.toLowerCase(),
      );
      const needsPersist =
        !known ||
        !known.subcategories.some((s) => s.toLowerCase() === sub.toLowerCase());

      if (needsPersist) {
        setSaving(true);
        try {
          await addCategory(pendingCategory, sub);
        } catch (err) {
          setSaveError(
            err instanceof Error ? err.message : "Could not save the category.",
          );
          return;
        } finally {
          setSaving(false);
        }
      }

      setSaveError(null);
      onCategorize(current.id, {
        category: known?.name ?? pendingCategory,
        subcategory: sub,
      });
      goto(index + 1);
    },
    [current, pendingCategory, categories, addCategory, onCategorize, goto, index],
  );

  // Alt chords — don't collide with typing in the picker's search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goto(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goto(index + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip, goto, index]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!categories) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          Loading categories…
        </CardContent>
      </Card>
    );
  }
  if (deck.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <p className="font-medium">Nothing to categorize</p>
          <p className="text-muted-foreground text-sm">
            Every imported transaction was a netted transfer.
          </p>
          <Button onClick={onComplete}>Go to review →</Button>
        </CardContent>
      </Card>
    );
  }

  const handledCount = deck.filter(
    (t) => categorizations[t.id] !== undefined,
  ).length;

  if (index >= deck.length) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="text-lg font-semibold">Deck complete</p>
          <p className="text-muted-foreground text-sm">
            {handledCount} of {deck.length} transactions handled.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="ghost" onClick={() => goto(deck.length - 1)}>
              Back to last card
            </Button>
            <Button onClick={onComplete}>Review results →</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const categoryNames = categories.map((c) => c.name);
  const pendingCat = categories.find(
    (c) => c.name.toLowerCase() === (pendingCategory ?? "").toLowerCase(),
  );
  const subcategoryNames = pendingCat?.subcategories ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Progress value={(handledCount / deck.length) * 100} className="flex-1" />
        <div className="text-muted-foreground text-sm whitespace-nowrap tabular-nums">
          <span className="text-foreground font-medium">{index + 1}</span> /{" "}
          {deck.length}
          <span className="opacity-70"> · {handledCount} done</span>
        </div>
      </div>

      <TransactionCard transaction={current!} />

      {step === "category" ? (
        <CategoryPicker
          key={`cat-${current!.id}`}
          label="Category"
          options={categoryNames}
          value={pendingCategory}
          onPick={chooseCategory}
          onCreate={chooseCategory}
        />
      ) : (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={changeCategory}
            className="-ml-2"
          >
            ← {pendingCategory}
            {!pendingCat && (
              <span className="text-muted-foreground ml-1">(new)</span>
            )}
          </Button>
          <CategoryPicker
            key={`sub-${current!.id}-${pendingCategory}`}
            label="Subcategory"
            options={subcategoryNames}
            value={existing?.subcategory ?? null}
            onPick={commitSubcategory}
            onCreate={commitSubcategory}
            onEscape={changeCategory}
          />
          {saving && (
            <p className="text-muted-foreground text-xs">Saving…</p>
          )}
          {saveError && (
            <Alert variant="destructive">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => goto(index - 1)}
          disabled={index === 0}
        >
          Back
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline">
            ⌥S skip · ⌥← ⌥→ move
          </span>
          <Button variant="ghost" onClick={skip}>
            Skip
          </Button>
          <Button variant="outline" onClick={onComplete}>
            Finish →
          </Button>
        </div>
      </div>
    </div>
  );
}
