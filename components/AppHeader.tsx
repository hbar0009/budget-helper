"use client";

import { Button } from "@/components/ui/button";

export default function AppHeader({ onReset }: { onReset?: () => void }) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="from-primary size-4 rounded-[5px] bg-gradient-to-br to-indigo-400 shadow-sm" />
          budget-helper
        </div>
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Start over
          </Button>
        )}
      </div>
    </header>
  );
}
