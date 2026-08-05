import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Banknote,
  Briefcase,
  Building2,
  CheckSquare,
  Clock,
  HandCoins,
  LayoutDashboard,
  LineChart,
  LogOut,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/api";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Clock;
  roles?: AppRole[]; // undefined = everyone
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: null,
    items: [
      { to: "/", label: "My Day", icon: LayoutDashboard },
      { to: "/timesheet", label: "My Timesheet", icon: Clock },
    ],
  },
  {
    title: "Delivery",
    items: [
      { to: "/approvals", label: "Approvals", icon: CheckSquare, roles: ["pm"] },
      { to: "/projects", label: "Projects", icon: Briefcase, roles: ["pm", "finance"] },
    ],
  },
  {
    title: "Money",
    items: [
      { to: "/clients", label: "Clients", icon: Building2, roles: ["finance"] },
      { to: "/invoices", label: "Invoices", icon: Banknote, roles: ["finance"] },
      { to: "/payouts", label: "Payouts", icon: HandCoins, roles: ["finance"] },
      { to: "/reports", label: "Reports", icon: LineChart, roles: ["pm", "finance"] },
    ],
  },
  {
    title: "System",
    items: [{ to: "/admin", label: "Admin", icon: Settings, roles: ["admin"] }],
  },
];

export function AppShell() {
  const { profile, roles, hasRole, signOut, api, userId } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!userId) return;
    api.workspace
      .notifications()
      .then((ns) => setUnread(ns.filter((n) => !n.read_at).length))
      .catch(() => {});
    return api.workspace.onNotification(userId, () => setUnread((u) => u + 1));
  }, [api, userId, pathname]);

  const initials = (profile?.full_name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active font-display text-lg leading-none text-white">
            i
          </div>
          <div>
            <span className="font-display text-lg tracking-tight">iBrave&nbsp;OS</span>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV.map((section) => {
            const visible = section.items.filter(
              (item) => !item.roles || item.roles.some(hasRole)
            );
            if (visible.length === 0) return null;
            return (
              <div key={section.title ?? "main"}>
                {section.title && (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visible.map((item) => {
                    const active =
                      item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                          active
                            ? "bg-white/10 text-white shadow-[inset_2px_0_0_0_hsl(var(--sidebar-active))]"
                            : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 transition-colors",
                            active
                              ? "text-sidebar-active"
                              : "text-sidebar-muted group-hover:text-sidebar-foreground"
                          )}
                        />
                        {item.label}
                        {item.to === "/" && unread > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-active px-1.5 text-[11px] font-semibold text-white">
                            {unread}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold tracking-wide">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name}</p>
              <p className="truncate text-xs text-sidebar-muted">
                {roles.join(" · ") || "member"}
              </p>
            </div>
            <button
              onClick={() => void signOut()}
              title="Sign out"
              className="rounded-md p-2 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl p-6 lg:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
