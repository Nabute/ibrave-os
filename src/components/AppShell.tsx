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
  Target,
  UserRoundSearch,
  Users,
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
      <aside className="no-print sticky top-0 flex h-screen w-[236px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <span className="font-display text-lg text-white">iBrave&nbsp;OS</span>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto py-4">
          {NAV.map((section) => {
            const visible = section.items.filter(
              (item) => !item.roles || item.roles.some(hasRole)
            );
            if (visible.length === 0) return null;
            return (
              <div key={section.title ?? "main"}>
                {section.title && (
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
                        className={cn(
                          // Active = 2px brass rail + one step lighter surface.
                          // No fill pill, no rounding — the rail is the signal.
                          "group flex items-center gap-3 px-5 py-2 text-[13.5px] font-medium transition-colors duration-fast ease-ledger",
                          active
                            ? "bg-sidebar-active text-white shadow-[inset_2px_0_0_0_hsl(var(--brass))]"
                            : "text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-white"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 transition-colors duration-fast",
                            active
                              ? "text-brass"
                              : "text-sidebar-muted group-hover:text-sidebar-foreground"
                          )}
                        />
                        {item.label}
                        {item.to === "/" && unread > 0 && (
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
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold">
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
