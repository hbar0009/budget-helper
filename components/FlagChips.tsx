"use client";

import { FlagIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Flag } from "@/lib/db/flags";
import { cn } from "@/lib/utils";

/** The small coloured markers shown on a flagged transaction. */
export default function FlagChips({
  flags,
  className,
}: {
  flags: Flag[] | undefined;
  className?: string;
}) {
  if (!flags || flags.length === 0) return null;

  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {flags.map((flag) => (
        <Badge
          key={flag.id}
          variant="outline"
          className={cn(
            "gap-1",
            flag.kind === "wrong_account" && flag.status === "open"
              ? "border-warning/40 text-warning"
              : flag.kind === "wrong_account"
                ? "border-success/40 text-success"
                : "text-muted-foreground",
          )}
          title={flagTitle(flag)}
        >
          <FlagIcon className="size-3" />
          {flagLabel(flag)}
        </Badge>
      ))}
    </span>
  );
}

function flagLabel(flag: Flag): string {
  if (flag.kind === "note") return "note";
  return flag.status === "open" ? "wrong account" : "account corrected";
}

function flagTitle(flag: Flag): string | undefined {
  if (flag.kind === "note") {
    return "text" in flag.data ? flag.data.text : undefined;
  }
  return "note" in flag.data ? flag.data.note : undefined;
}
