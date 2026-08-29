"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
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
  /** Called on Escape when the search box is already empty (used to step back). */
  onEscape?: () => void;
}

/**
 * Keyboard-first single-select built on `cmdk`: type to filter, ↑/↓ to move,
 * Enter to pick. Also fully clickable. The parent remounts it (via `key`) for
 * each card / step so it re-focuses and clears.
 */
export default function CategoryPicker({
  label,
  options,
  value,
  onPick,
  onEscape,
}: Props) {
  const [search, setSearch] = useState("");

  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      <Command loop className="border">
        <CommandInput
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder={`Filter ${label.toLowerCase()}…`}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !search) {
              e.preventDefault();
              onEscape?.();
            }
          }}
        />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup>
            {options.map((option) => (
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
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
