import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { SplashScreen } from "@/components/SplashScreen";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { MfaGate } from "@/features/auth/MfaGate";
import { useSession } from "@/lib/session";
import { canAccessPath } from "@/routes/access";

function Root() {
  return <Outlet />;
}

/** Auth gate (meqenet LoginGate pattern): no session → login screen.
 *  The splash holds the screen until auth is RESOLVED, so neither login nor
 *  dashboard ever flashes while the session restores. */
function AuthenticatedLayout() {
  const { ready, userId } = useSession();
  if (!ready) return <SplashScreen />;
  if (!userId) return <LoginScreen />;
  return (
    <MfaGate>
      <AuthorizedShell />
    </MfaGate>
  );
}

function AuthorizedShell() {
  const { api, roles } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = canAccessPath(pathname, roles);

  useEffect(() => {
    if (!allowed) {
      void api.security.recordEvent("frontend.route_denied", { pathname, roles });
    }
  }, [api, allowed, pathname, roles]);

  if (!allowed) return <NotAuthorized />;
  return <AppShell />;
}

function NotAuthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6">
        <h1 className="font-display text-2xl tracking-tight">Not authorized</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your account does not have access to this workspace area.
        </p>
        <Button asChild className="mt-5">
          <Link to="/">Go to My Day</Link>
        </Button>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Root });

const privacyNoticeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy-notice",
  component: lazyRouteComponent(
    () => import("@/features/privacy/PrivacyNoticeScreen"),
    "PrivacyNoticeScreen"
  ),
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AuthenticatedLayout,
});

// Every screen is its own chunk; the shell + login stay in the entry bundle.
const routes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/",
    component: lazyRouteComponent(() => import("@/features/my-day/MyDayScreen"), "MyDayScreen"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/timesheet",
    component: lazyRouteComponent(
      () => import("@/features/timesheets/TimesheetScreen"),
      "TimesheetScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/approvals",
    component: lazyRouteComponent(
      () => import("@/features/approvals/ApprovalsScreen"),
      "ApprovalsScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/projects",
    component: lazyRouteComponent(
      () => import("@/features/projects/ProjectsScreen"),
      "ProjectsScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/projects/$projectId",
    component: lazyRouteComponent(
      () => import("@/features/projects/ProjectDetailScreen"),
      "ProjectDetailScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/clients",
    component: lazyRouteComponent(() => import("@/features/clients/ClientsScreen"), "ClientsScreen"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/clients/$clientId",
    component: lazyRouteComponent(
      () => import("@/features/clients/ClientDetailScreen"),
      "ClientDetailScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/invoices",
    component: lazyRouteComponent(
      () => import("@/features/invoicing/InvoicesScreen"),
      "InvoicesScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/invoices/$invoiceId",
    component: lazyRouteComponent(
      () => import("@/features/invoicing/InvoiceDetailScreen"),
      "InvoiceDetailScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/staffing",
    component: lazyRouteComponent(
      () => import("@/features/staffing/StaffingScreen"),
      "StaffingScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/sales",
    component: lazyRouteComponent(() => import("@/features/sales/SalesScreen"), "SalesScreen"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/prospecting",
    component: lazyRouteComponent(
      () => import("@/features/prospecting/ProspectingScreen"),
      "ProspectingScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/calendar",
    component: lazyRouteComponent(
      () => import("@/features/calendar/CalendarScreen"),
      "CalendarScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/command-center",
    component: lazyRouteComponent(
      () => import("@/features/command-center/CommandCenterScreen"),
      "CommandCenterScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/recruiting",
    component: lazyRouteComponent(
      () => import("@/features/recruiting/RecruitingScreen"),
      "RecruitingScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/people",
    component: lazyRouteComponent(() => import("@/features/people/PeopleScreen"), "PeopleScreen"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/people/$personId",
    component: lazyRouteComponent(
      () => import("@/features/people/PersonDetailScreen"),
      "PersonDetailScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/payouts",
    component: lazyRouteComponent(() => import("@/features/payouts/PayoutsScreen"), "PayoutsScreen"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/payouts/$payoutId",
    component: lazyRouteComponent(
      () => import("@/features/payouts/PayoutDetailScreen"),
      "PayoutDetailScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/reports",
    component: lazyRouteComponent(() => import("@/features/reports/ReportsScreen"), "ReportsScreen"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/admin",
    component: lazyRouteComponent(() => import("@/features/admin/AdminScreen"), "AdminScreen"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/templates",
    component: lazyRouteComponent(
      () => import("@/features/templates/TemplatesScreen"),
      "TemplatesScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings",
    component: lazyRouteComponent(
      () => import("@/features/settings/PreferencesScreen"),
      "PreferencesScreen"
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/privacy",
    component: lazyRouteComponent(
      () => import("@/features/privacy/PrivacyCenterScreen"),
      "PrivacyCenterScreen"
    ),
  }),
];

const routeTree = rootRoute.addChildren([privacyNoticeRoute, appRoute.addChildren(routes)]);

export const router = createRouter({
  routeTree,
  // Hovering a nav link preloads that route's chunk, so the click is instant.
  defaultPreload: "intent",
  // A hairline pause instead of a spinner flash while a chunk loads.
  defaultPendingComponent: () => <div className="min-h-24" />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
