import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Facet {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

/**
 * The one control strip above every data table: search box, facet filters,
 * a live result count and an optional trailing slot for page actions.
 */
export function TableToolbar({
  query,
  onQuery,
  facets = [],
  count,
  total,
  placeholder = "Search",
  children,
  className,
}: {
  query: string;
  onQuery: (v: string) => void;
  facets?: Facet[];
  count: number;
  total: number;
  placeholder?: string;
  children?: ReactNode;
  className?: string;
}) {
  const filtering = query.trim() !== "" || facets.some((f) => f.value !== "all");

  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)}>
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-8"
          aria-label={placeholder}
        />
      </div>

      {facets.map((f) => (
        <Select key={f.key} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger className="h-9 w-auto min-w-32 gap-1.5">
            <span className="label-caps text-[10px] text-muted-foreground">{f.label}</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {filtering && (
        <>
          <span className="num text-xs text-muted-foreground">
            {count} of {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-muted-foreground"
            onClick={() => {
              onQuery("");
              facets.forEach((f) => f.onChange("all"));
            }}
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        </>
      )}

      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Bulk action bar: appears only when rows are selected. Brass rail on the
 * left so it reads as "a state you are in", not another card.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
  noun = "row",
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
  noun?: string;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-brass/5 px-3 py-2 shadow-[inset_2px_0_0_0_hsl(var(--brass))]">
      <span className="text-sm font-medium">
        <span className="num">{count}</span> {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

/** Row checkbox, shared so every table's selection column looks the same. */
export function RowCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="h-4 w-4 accent-[hsl(var(--brass))]"
      checked={checked}
      onChange={onChange}
    />
  );
}
