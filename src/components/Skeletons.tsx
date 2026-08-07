// Composite loading states, all built from the one shimmer primitive so every
// screen "loads" the same way. Match the skeleton to the layout it replaces:
// TableSkeleton for tables, CardGridSkeleton for card grids, BoardSkeleton
// for kanban columns, KpiRowSkeleton for tile rows.
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
              className={cn("h-3.5", c === 0 ? "w-40" : "flex-1 max-w-28")}
              // stagger widths a touch so it reads as content, not stripes
              style={c === 0 ? undefined : { maxWidth: `${72 + ((r * 37 + c * 53) % 48)}px` }}
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
