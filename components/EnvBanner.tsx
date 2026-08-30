import { cn } from "@/lib/utils";

/**
 * Full-width strip at the very top of every screen naming the data profile in
 * use, so you always know whether you're touching real data. `dev` is amber
 * ("this isn't your real data"), `prod` is blue ("calm — live data"). The value is resolved server-side
 * from `BUDGET_PROFILE` (see `lib/config/paths.ts`) and passed in, so it can't
 * disagree with what's actually running.
 */
export default function EnvBanner({ profile }: { profile: "dev" | "prod" }) {
  const isProd = profile === "prod";
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-1 text-xs font-medium",
        isProd ? "bg-info/12 text-info" : "bg-warning/15 text-warning",
      )}
    >
      <span
        className={cn(
          "inline-block size-1.5 rounded-full",
          isProd ? "bg-info" : "bg-warning",
        )}
      />
      {isProd ? (
        <span>
          <strong className="font-semibold">PROD</strong> — live data in{" "}
          <code className="font-mono">data/prod/</code>
        </span>
      ) : (
        <span>
          <strong className="font-semibold">DEV</strong> — sandbox data in{" "}
          <code className="font-mono">data/dev/</code>
        </span>
      )}
    </div>
  );
}
