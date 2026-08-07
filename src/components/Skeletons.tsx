// Composite loading states, all built from the one shimmer primitive so every
// screen "loads" the same way. Match the skeleton to the layout it replaces:
// TableSkeleton for tables, CardGridSkeleton for card grids, BoardSkeleton
// for kanban columns, KpiRowSkeleton for tile rows.
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TABLE_WIDTHS = ["max-w-[76px]", "max-w-[92px]", "max-w-[108px]", "max-w-[84px]"];
const LIST_WIDTHS = ["max-w-[220px]", "max-w-[260px]", "max-w-[300px]", "max-w-[340px]"];

export function TableSkeleton({
  rows = 6,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0", className)} aria-label="Loading" role="status">
      {/* header band */}
      <div className="flex gap-4 border-b bg-muted/60 px-3 py-2.5">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className={cn("h-3", c === 0 ? "w-32" : "w-20", c > 0 && "flex-1 max-w-24")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-3 py-3 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton
              key={c}
              className={cn(
                "h-3.5",
                c === 0 ? "w-40" : "flex-1",
                c > 0 && TABLE_WIDTHS[(r + c) % TABLE_WIDTHS.length]
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  cards = 3,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)} role="status">
      {Array.from({ length: cards }, (_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-36" />
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Skeleton className="h-3.5 w-full max-w-56" />
            <Skeleton className="h-3.5 w-full max-w-40" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function KpiRowSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status">
      {Array.from({ length: tiles }, (_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 pt-5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-2.5 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div
      className={cn(
        "grid gap-3 md:grid-cols-2",
        columns >= 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"
      )}
      role="status"
    >
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="min-h-24 space-y-2 rounded-lg bg-muted/40 p-2">
            {Array.from({ length: ((c * 7) % 2) + 1 }, (_, i) => (
              <div key={i} className="space-y-1.5 rounded-md border border-l-[3px] border-l-border bg-card p-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Detail-page skeleton: title block → KPI row → content table. */
export function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <KpiRowSkeleton />
      <Card>
        <CardContent className="pt-4">
          <TableSkeleton rows={5} cols={5} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Stacked-list skeleton (feeds, task queues, timelines). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 border-b pb-3 last:border-b-0">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={cn("h-3.5", LIST_WIDTHS[i % LIST_WIDTHS.length])} />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
