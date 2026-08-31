"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Work" },
  { href: "/analysis", label: "Analysis" },
] as const;

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="from-primary size-4 rounded-[5px] bg-gradient-to-br to-indigo-400 shadow-sm" />
          budget-helper
        </div>
        <nav className="flex gap-1 text-sm">
          {LINKS.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
