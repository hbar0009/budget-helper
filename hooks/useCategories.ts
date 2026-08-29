"use client";

import { useEffect, useState } from "react";
import type { Category } from "@/lib/categories/config";

interface State {
  categories: Category[] | null;
  error: string | null;
}

/** Fetches the category taxonomy from `/api/categories` once. */
export function useCategories(): State {
  const [state, setState] = useState<State>({ categories: null, error: null });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/categories")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load categories.");
        if (!cancelled) {
          setState({ categories: data.categories as Category[], error: null });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ categories: null, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
