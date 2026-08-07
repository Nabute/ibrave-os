import { useMemo, useState } from "react";

export interface FacetDef<T> {
  key: string;
  label: string;
  /** Facet value for a row; rows match when equal to the selected value. */
  get: (row: T) => string | null | undefined;
  /** Fixed option list; omit to derive distinct values from the data. */
  options?: { value: string; label: string }[];
}

/**
 * Client-side search + facet filtering + row selection for a table.
 * One hook per table keeps every data view behaving identically:
 * search matches case-insensitively against the row's haystack, facets are
 * exact-match dropdowns ("all" passes everything), and selection survives
 * filtering but exposes only the currently visible selected rows for bulk
 * actions, so you can never bulk-act on something you can't see.
 */
export function useTableControls<T>(
  rows: T[],
  opts: {
    haystack: (row: T) => string;
    getId: (row: T) => string;
    facets?: FacetDef<T>[];
  }
) {
  const [query, setQuery] = useState("");
  const [facetValues, setFacetValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !opts.haystack(r).toLowerCase().includes(q)) return false;
      for (const f of opts.facets ?? []) {
        const v = facetValues[f.key] ?? "all";
        if (v !== "all" && String(f.get(r) ?? "") !== v) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, facetValues]);

  const facets = (opts.facets ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    value: facetValues[f.key] ?? "all",
    onChange: (v: string) => setFacetValues((s) => ({ ...s, [f.key]: v })),
    options:
      f.options ??
      [...new Set(rows.map((r) => String(f.get(r) ?? "")).filter(Boolean))]
        .sort()
        .map((v) => ({ value: v, label: v.replace(/_/g, " ") })),
  }));

  const visibleIds = filtered.map(opts.getId);
  const selectedVisible = filtered.filter((r) => selected.has(opts.getId(r)));

  return {
    rows: filtered,
    query,
    setQuery,
    facets,
    selection: {
      has: (id: string) => selected.has(id),
      count: selectedVisible.length,
      rows: selectedVisible,
      toggle: (id: string) =>
        setSelected((s) => {
          const n = new Set(s);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        }),
      allVisible: visibleIds.length > 0 && visibleIds.every((id) => selected.has(id)),
      toggleAll: () =>
        setSelected((s) => {
          const all = visibleIds.every((id) => s.has(id));
          const n = new Set(s);
          for (const id of visibleIds) all ? n.delete(id) : n.add(id);
          return n;
        }),
      clear: () => setSelected(new Set()),
    },
  };
}

export type TableControls<T> = ReturnType<typeof useTableControls<T>>;
