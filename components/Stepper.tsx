"use client";

import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type Stage = "import" | "autoReview" | "categorize" | "review";

const LABELS: Record<Stage, string> = {
  import: "Import",
  autoReview: "Auto-review",
  categorize: "Categorize",
  review: "Review",
};

interface Props {
  stage: Stage;
  /** The steps to show, in order. */
  stages: Stage[];
  /** True once transactions have been imported (later steps become reachable). */
  unlocked: boolean;
  onNavigate: (stage: Stage) => void;
}

export default function Stepper({ stage, stages, unlocked, onNavigate }: Props) {
  const activeIndex = stages.indexOf(stage);

  return (
    <nav className="mb-6 flex gap-2" aria-label="Progress">
      {stages.map((key, i) => {
        const state =
          i === activeIndex ? "active" : i < activeIndex ? "done" : "upcoming";
        // Once there's data every step is reachable — including Import, to add
        // another statement without discarding what's already there.
        const clickable = unlocked && i !== activeIndex;

        return (
          <button
            key={key}
            type="button"
            aria-current={i === activeIndex ? "step" : undefined}
            disabled={!clickable}
            onClick={() => clickable && onNavigate(key)}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              state === "active" && "border-primary ring-primary/40 ring-1",
              state === "done" &&
                "text-foreground hover:bg-accent cursor-pointer",
              state === "upcoming" && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-xs tabular-nums",
                state === "upcoming"
                  ? "bg-muted"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {state === "done" ? <CheckIcon className="size-3" /> : i + 1}
            </span>
            {LABELS[key]}
          </button>
        );
      })}
    </nav>
  );
}
