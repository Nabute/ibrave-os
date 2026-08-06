import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

/**
 * Client-side column sorting for list screens. Null/undefined sort last;
 * numbers numerically, everything else as case-insensitive strings.
 */
export function useSort<T>(rows: T[], initialKey?: keyof T & string, initialDir: SortDir = "desc") {
  const [sortKey, setSortKey] = useState<string | null>(initialKey ?? null);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const val = (r: T) => (r as Record<string, unknown>)[sortKey];
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, dir]);

  const toggle = (key: string) => {
    if (sortKey === key) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setDir("desc");
    }
  };

  return { rows: sorted, sortKey, dir, toggle };
}
