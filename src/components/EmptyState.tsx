import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ledger empty state — illustration → title → supporting line → one action.
 *
 * The "illustration" is typographic, not clipart: the icon sits on a paper
 * coin with a hairline ring and one brass quarter-arc (the same
 * one-accent-spent-once rule as everything else). Without an icon it falls
 * back to the original quiet single-sentence form, so legacy call sites keep
 * working unchanged.
 */
export function EmptyState({
  icon: Icon,
  sentence,
  description,
  action,
  onAction,
  className,
}: {
  /** Lucide icon that sets the scene (adds the illustrated variant). */
  icon?: LucideIcon;
  /** The headline — kept short, reads as a statement, not an apology. */
  sentence: string;
  /** Supporting line under the headline (illustrated variant). */
  description?: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  if (!Icon) {
    return (
      <div
        className={cn(
          "flex min-h-24 flex-col items-center justify-center gap-2 py-6 text-center",
          className
        )}
      >
        <p className="font-display text-xl text-muted-foreground">{sentence}</p>
        {action && (
          <button
            onClick={onAction}
            className="rounded-sm text-sm font-medium text-foreground underline decoration-brass decoration-2 underline-offset-4 transition-colors duration-fast hover:text-brass focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            {action}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center",
        className
      )}
    >
      {/* the coin: layered rings, one brass arc */}
      <div className="relative mb-4 h-24 w-24">
        <div className="absolute inset-0 rounded-full border border-border bg-muted/50" />
        <div className="absolute inset-2 rounded-full border border-grid-line bg-card" />
        {/* brass quarter-arc */}
        <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-45">
          <circle
            cx="48"
            cy="48"
            r="47"
            fill="none"
            stroke="hsl(var(--brass))"
            strokeWidth="2"
            strokeDasharray="74 296"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
        </div>
      </div>

      <p className="font-display text-[22px] leading-tight text-foreground">{sentence}</p>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button className="mt-4" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
