"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category } from "@/lib/categories/config";

interface UseCategories {
  categories: Category[] | null;
  error: string | null;
  /**
   * Persist a new category and/or subcategory (`POST /api/categories`) and fold
   * the result into local state. Rejects with a message on failure.
   */
  addCategory: (category: string, subcategory?: string) => Promise<Category[]>;
}

/** Loads the category taxonomy from `/api/categories` and lets callers extend it. */
export function useCategories(): UseCategories {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/categories")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load categories.");
        if (!cancelled) setCategories(data.categories as Category[]);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const addCategory = useCallback(
    async (category: string, subcategory?: string) => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, subcategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add the category.");
      const next = data.categories as Category[];
      setCategories(next);
      return next;
    },
    [],
  );

  return { categories, error, addCategory };
}
