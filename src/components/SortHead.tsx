import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

import { TableHead } from "@/components/ui/table";
import type { SortDir } from "@/lib/useSort";
import { cn } from "@/lib/utils";

/** Sortable column head — the sort arrow appears in brass (Ledger spec). */
export function SortHead({
  children,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  children: ReactNode;
  sortKey: string;
  current: string | null;
  dir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <TableHead className={cn("p-0", className)}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          "label-caps flex h-10 w-full items-center gap-1 px-4 text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/30",
          className?.includes("text-right") && "justify-end",
          active && "text-foreground"
        )}
      >
        {children}
        {active &&
          (dir === "asc" ? (
            <ArrowUp className="h-3 w-3 text-brass" />
          ) : (
            <ArrowDown className="h-3 w-3 text-brass" />
          ))}
      </button>
    </TableHead>
  );
}
