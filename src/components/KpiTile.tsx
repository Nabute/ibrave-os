import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export type KpiKind = "default" | "attention" | "critical" | "positive";

const TOP_RULE: Record<KpiKind, string> = {
  default: "border-t border-border",
  attention: "border-t-2 border-t-warning",
  critical: "border-t-2 border-t-destructive",
  positive: "border-t-2 border-t-success",
};

const LABEL_FG: Record<KpiKind, string> = {
  default: "text-muted-foreground",
  attention: "text-warning",
  critical: "text-destructive",
  positive: "text-success",
};

/**
 * Ledger KPI tile — fixed anatomy: mono-caps label → 34px mono figure → one
 * line of context → optional 3px meter. Alarm state is a 2px top rule in the
 * kind color plus a recolored label; the figure itself never changes color —
 * only its frame does. Tiles never carry shadow.
 */
export function KpiTile({
  label,
  value,
  sub,
  kind = "default",
  meterPct,
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  kind?: KpiKind;
  /** 0–100; renders the 3px brass meter (kind color when alarmed) */
  meterPct?: number;
  to?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex min-h-[148px] flex-col border-x border-b bg-card px-5 py-4 transition-shadow duration-fast ease-ledger rounded-b-md",
        TOP_RULE[kind],
        to && "hover:shadow-float"
      )}
    >
      <p className={cn("label-caps", LABEL_FG[kind])}>{label}</p>
      <p className="num mt-2 text-[34px] font-medium leading-9 text-foreground">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[13px] text-muted-foreground">{sub}</p>}
      {meterPct != null && (
        <div className="mt-auto pt-3">
          <div className="h-[3px] w-full bg-muted">
            <div
              className={cn(
                "h-full",
                kind === "critical"
                  ? "bg-destructive"
                  : kind === "attention"
                    ? "bg-warning"
                    : "bg-brass"
              )}
              style={{ width: `${Math.min(100, Math.max(0, meterPct))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        {body}
      </Link>
    );
  }
  return body;
}
