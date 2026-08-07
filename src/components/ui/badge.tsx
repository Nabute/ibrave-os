import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    // Ledger status system: 5 kinds, subtle emphasis by default. Kind is
    // decided by semantics at the call site, never re-tinted ad hoc.
    variants: {
      variant: {
        /** progress, submitted, in review, sent, in flight */
        default: "border-transparent bg-info-subtle text-info",
        /** neutral, draft, new, unassigned, archived */
        secondary: "border-transparent bg-muted text-muted-foreground",
        /** critical, overdue, rejected, lost, escalated */
        destructive: "border-transparent bg-destructive-subtle text-destructive",
        /** neutral hairline */
        outline: "text-muted-foreground",
        /** positive, approved, paid, won, healthy */
        success: "border-transparent bg-success-subtle text-success",
        /** attention, due soon, at risk, over 12h */
        warning: "border-transparent bg-warning-subtle text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
