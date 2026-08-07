import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Banknote,
  Briefcase,
  Building2,
  CalendarDays,
  CheckSquare,
  Gauge,
  Clock,
  Contact,
  HandCoins,
  Handshake,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Target,
  UserRoundSearch,
  Users,
  LayoutDashboard,
  LineChart,
  LogOut,
  MailPlus,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/api";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Clock;
  roles?: AppRole[]; // undefined = everyone
  /** Stable product-tour anchor (data-tour attribute). */
  tour?: string;
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
      { to: "/timesheet", label: "My Timesheet", icon: Clock, tour: "timesheet-link" },
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Delivery",
    items: [
      { to: "/approvals", label: "Approvals", icon: CheckSquare, roles: ["pm"] },
      { to: "/projects", label: "Projects", icon: Briefcase, roles: ["pm", "finance"] },
      {
        to: "/staffing",
        label: "Staffing",
        icon: Users,
        roles: ["resourcing", "pm", "finance"],
      },
      {
        to: "/people",
        label: "People",
        icon: Contact,
        roles: ["resourcing", "pm", "finance", "recruiter"],
      },
      {
        to: "/recruiting",
        label: "Recruiting",
        icon: UserRoundSearch,
        roles: ["recruiter"],
      },
    ],
  },
  {
    title: "Growth",
    items: [
      { to: "/prospecting", label: "Prospecting", icon: Target, roles: ["sales"] },
      { to: "/sales", label: "Sales", icon: Handshake, roles: ["sales", "finance"] },
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
    title: "Owner",
    items: [
      { to: "/command-center", label: "Command Center", icon: Gauge, roles: ["owner"] },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/settings", label: "Preferences", icon: SlidersHorizontal, tour: "preferences-link" },
      {
        to: "/templates",
        label: "Email templates",
        icon: MailPlus,
        roles: ["finance", "sales", "recruiter", "admin"],
      },
      { to: "/admin", label: "Admin", icon: Settings, roles: ["admin"] },
    ],
  },
];

export function AppShell() {
  const { profile, roles, hasRole, signOut, api, userId } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [unread, setUnread] = useState(0);
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark"
  );
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar") === "collapsed"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // The stored preference (Preferences → Appearance) wins on a fresh device.
  const themePref = profile?.preferences?.theme;
  useEffect(() => {
    if (themePref) setDark(themePref === "dark");
  }, [themePref]);

  useEffect(() => {
    localStorage.setItem("sidebar", collapsed ? "collapsed" : "open");
  }, [collapsed]);

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
      <aside
        className={cn(
          "no-print sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-base ease-ledger",
          collapsed ? "w-[60px]" : "w-[236px]"
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center",
            collapsed ? "justify-center" : "justify-between px-5"
          )}
        >
          {!collapsed && (
            <span className="font-display text-lg text-white">ibrave&nbsp;OS</span>
          )}
          <button
            data-tour="collapse"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-1.5 text-sidebar-muted transition-colors duration-fast hover:bg-sidebar-active hover:text-white"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav data-tour="nav" className="flex-1 space-y-6 overflow-y-auto py-4">
          {NAV.map((section) => {
            const visible = section.items.filter(
              (item) => !item.roles || item.roles.some(hasRole)
            );
            if (visible.length === 0) return null;
            return (
              <div key={section.title ?? "main"}>
                {section.title && !collapsed && (
                  <p className="label-caps mb-1.5 px-5 text-[10px] text-sidebar-muted">
                    {section.title}
                  </p>
                )}
                <div>
                  {visible.map((item) => {
                    const active =
                      item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        data-tour={item.tour}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          // Active = 2px brass rail + one step lighter surface.
                          // No fill pill, no rounding — the rail is the signal.
                          "group flex items-center gap-3 py-2 text-[13.5px] font-medium transition-colors duration-fast ease-ledger",
                          collapsed ? "justify-center px-0" : "px-5",
                          active
                            ? "bg-sidebar-active text-white shadow-[inset_2px_0_0_0_hsl(var(--brass))]"
                            : "text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-white"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors duration-fast",
                            active
                              ? "text-brass"
                              : "text-sidebar-muted group-hover:text-sidebar-foreground"
                          )}
                        />
                        {!collapsed && item.label}
                        {!collapsed && item.to === "/" && unread > 0 && (
                          <span className="num ml-auto text-[11px] font-semibold text-brass">
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
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg py-2",
              collapsed ? "flex-col px-0" : "px-2"
            )}
          >
            <div
              className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold"
              title={collapsed ? profile?.full_name : undefined}
            >
              {initials}
            </div>
            {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name}</p>
              <p className="truncate text-xs text-sidebar-muted">
                {roles.join(" · ") || "member"}
              </p>
            </div>
            )}
            <button
              onClick={() => {
                const next = !dark;
                setDark(next);
                // Persist so the choice follows the user to other devices.
                if (userId)
                  void supabase
                    .from("profiles")
                    .update({
                      preferences: {
                        ...(profile?.preferences ?? {}),
                        theme: next ? "dark" : "light",
                      },
                    })
                    .eq("id", userId);
              }}
              title={dark ? "Light mode" : "Dark mode"}
              aria-label="Toggle theme"
              className="rounded-md p-2 text-sidebar-muted transition-colors duration-fast hover:bg-sidebar-active hover:text-white"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => void signOut()}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-md p-2 text-sidebar-muted transition-colors duration-fast hover:bg-sidebar-active hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {/* Full-bleed workspace: a dense daily tool earns the whole monitor.
            The soft cap only kicks in on ultrawides. */}
        <div className="mx-auto w-full max-w-[1800px] p-6 lg:px-10 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
