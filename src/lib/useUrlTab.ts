import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * Tab state that lives in the URL (?tab=…) instead of component state, so a
 * refresh, back/forward, or a shared link lands on the tab you were on.
 * Uses replace-navigation, switching tabs doesn't pollute history.
 *
 * Usage: const [tab, setTab] = useUrlTab("bench");
 *        <Tabs value={tab} onValueChange={setTab}>
 */
export function useUrlTab(defaultTab: string, key = "tab"): [string, (v: string) => void] {
  const search = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const navigate = useNavigate();

  const raw = search?.[key];
  const value = typeof raw === "string" && raw.length > 0 ? raw : defaultTab;

  const setValue = (v: string) => {
    void navigate({
      // stay on the current route, only touch our search key
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        [key]: v === defaultTab ? undefined : v,
      }),
      replace: true,
    } as never);
  };

  return [value, setValue];
}
