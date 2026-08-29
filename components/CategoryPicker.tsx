"use client";

import { useState } from "react";
import { CheckIcon, PlusIcon } from "lucide-react";

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface Props {
  label: string;
  options: string[];
  /** Currently-selected option, if the card already has one. */
  value: string | null;
  onPick: (option: string) => void;
  /** Offer a "Create <typed text>" row when the text matches no option. */
  onCreate?: (value: string) => void;
  /** Called on Escape when the search box is already empty (used to step back). */
  onEscape?: () => void;
}

/**
 * Keyboard-first single-select built on `cmdk`: type to filter, ↑/↓ to move,
 * Enter to pick. Filtering is done here (not by cmdk) so the "Create" row can
 * sit alongside partial matches. The parent remounts it (via `key`) for each
 * card / step so it re-focuses and clears.
 */
export default function CategoryPicker({
  label,
  options,
  value,
  onPick,
  onCreate,
  onEscape,
}: Props) {
  const [search, setSearch] = useState("");

  const trimmed = search.trim();
  const q = trimmed.toLowerCase();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;
  const exactMatch = options.some((o) => o.toLowerCase() === q);
  const showCreate = Boolean(onCreate) && trimmed.length > 0 && !exactMatch;

  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      <Command loop shouldFilter={false} className="border">
        <CommandInput
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder={`Filter or add ${label.toLowerCase()}…`}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !search) {
              e.preventDefault();
              onEscape?.();
            }
          }}
        />
        <CommandList>
          <CommandGroup>
            {showCreate && (
              <CommandItem
                key="__create__"
                value={`__create__ ${trimmed}`}
                onSelect={() => onCreate?.(trimmed)}
              >
                <PlusIcon className="size-4 shrink-0" />
                <span className="truncate">Create &ldquo;{trimmed}&rdquo;</span>
              </CommandItem>
            )}
            {filtered.map((option) => (
              <CommandItem
                key={option}
                value={option}
                onSelect={() => onPick(option)}
                className="justify-between"
              >
                <span className="truncate">{option}</span>
                {option === value && (
                  <CheckIcon className="text-muted-foreground size-4 shrink-0" />
                )}
              </CommandItem>
            ))}
            {filtered.length === 0 && !showCreate && (
              <div className="text-muted-foreground py-6 text-center text-sm">
                No matches.
              </div>
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
