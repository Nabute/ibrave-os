import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Ledger empty state: 96px tall, a Newsreader 20px sentence and at most one
 * brass-underlined action. No illustration, no icon balloon.
 */
export function EmptyState({
  sentence,
  action,
  onAction,
  className,
}: {
  sentence: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
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
          className="text-sm font-medium text-foreground underline decoration-brass decoration-2 underline-offset-4 transition-colors duration-fast hover:text-brass focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 rounded-sm"
        >
          {action}
        </button>
      )}
    </div>
  );
}
