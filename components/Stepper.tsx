"use client";

import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Stage } from "@/app/lib/session";

const STEPS: { key: Stage; label: string }[] = [
  { key: "import", label: "Import" },
  { key: "categorize", label: "Categorize" },
  { key: "review", label: "Review" },
];

interface Props {
  stage: Stage;
  /** True once transactions have been imported (steps 2 and 3 become reachable). */
  unlocked: boolean;
  onNavigate: (stage: Stage) => void;
}

export default function Stepper({ stage, unlocked, onNavigate }: Props) {
  const activeIndex = STEPS.findIndex((s) => s.key === stage);

  return (
    <nav className="mb-6 flex gap-2" aria-label="Progress">
      {STEPS.map((step, i) => {
        const state =
          i === activeIndex ? "active" : i < activeIndex ? "done" : "upcoming";
        const clickable = unlocked && step.key !== "import" && i !== activeIndex;

        return (
          <button
            key={step.key}
            type="button"
            aria-current={i === activeIndex ? "step" : undefined}
            disabled={!clickable}
            onClick={() => clickable && onNavigate(step.key)}
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
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
