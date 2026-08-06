import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkflowAction } from "@/lib/api";

/**
 * Ledger dialog-workspace action bar: a sticky footer on paper with a 1px top
 * rule. At most one primary (ink fill), the rest ghost; anything beyond four
 * actions collapses into "More" so a state change never reflows the footer
 * into two rows.
 */
export function WorkspaceActions({
  actions,
  onAction,
  primaryAction,
  busy,
  extra,
}: {
  actions: WorkflowAction[];
  onAction: (a: WorkflowAction) => void;
  /** action name to render as the ink-filled primary (defaults to the first
   *  non-destructive action) */
  primaryAction?: string;
  busy?: boolean;
  /** non-workflow buttons (Email, Print…) rendered ghost at the left */
  extra?: ReactNode;
}) {
  // jsonb objects don't preserve the FSM's sort order, so the fallback picks
  // by semantic weight: forward-moving actions before parking/administrative.
  const PREFERENCE = [
    "win", "hire", "issue", "confirm", "approve", "accept", "fill", "convert",
    "offer", "assess", "interview", "screen", "send", "send_proposal",
    "qualify", "negotiate", "mark_paid", "record_payment", "reactivate",
    "submit", "credit_note", "pool",
  ];
  const rank = (a: WorkflowAction) => {
    const i = PREFERENCE.indexOf(a.action);
    return i === -1 ? PREFERENCE.length : i;
  };
  const primary =
    actions.find((a) => a.action === primaryAction) ??
    [...actions].filter((a) => !a.destructive).sort((a, b) => rank(a) - rank(b))[0];
  const rest = actions.filter((a) => a !== primary);
  const MAX_VISIBLE = 3; // + primary = four in the bar
  const visible = rest.slice(0, MAX_VISIBLE);
  const overflow = rest.slice(MAX_VISIBLE);

  return (
    <div className="sticky bottom-0 flex items-center gap-2 border-t bg-card px-6 py-3">
      <div className="flex gap-1.5">{extra}</div>
      <div className="ml-auto flex items-center gap-2">
        {overflow.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflow.map((a) => (
                <DropdownMenuItem
                  key={a.action}
                  destructive={a.destructive}
                  onSelect={() => onAction(a)}
                >
                  {a.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {visible.map((a) => (
          <Button
            key={a.action}
            variant={a.destructive ? "ghost" : "ghost"}
            className={a.destructive ? "text-destructive hover:text-destructive" : ""}
            onClick={() => onAction(a)}
            disabled={busy}
          >
            {a.label}
          </Button>
        ))}
        {primary && (
          <Button onClick={() => onAction(primary)} disabled={busy}>
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}
