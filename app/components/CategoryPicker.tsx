"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
 * Keyboard-first single-select: type to filter, ↑/↓ to move, Enter to pick.
 * Also fully clickable. Remounted by the parent (via `key`) for each card/step
 * so it re-focuses and clears.
 */
export default function CategoryPicker({
  label,
  options,
  value,
  onPick,
  onEscape,
}: Props) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, options]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick) onPick(pick);
    } else if (e.key === "Escape") {
      if (query) {
        e.preventDefault();
        setQuery("");
      } else {
        onEscape?.();
      }
    }
  }

  return (
    <div className="picker">
      <div className="picker__label">{label}</div>
      <input
        ref={inputRef}
        className="picker__search"
        type="text"
        placeholder={`Type to filter ${label.toLowerCase()}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      <ul className="picker__list" role="listbox" aria-label={label}>
        {filtered.map((option, i) => (
          <li key={option}>
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              className={
                "picker__option" +
                (i === highlight ? " is-highlight" : "") +
                (option === value ? " is-selected" : "")
              }
              onMouseEnter={() => setHighlight(i)}
              onClick={() => onPick(option)}
            >
              {option}
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="picker__empty">No matches</li>}
      </ul>
    </div>
  );
}
