import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { AdminScreen } from "@/features/admin/AdminScreen";
import { ApprovalsScreen } from "@/features/approvals/ApprovalsScreen";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { ClientDetailScreen } from "@/features/clients/ClientDetailScreen";
import { ClientsScreen } from "@/features/clients/ClientsScreen";
import { InvoiceDetailScreen } from "@/features/invoicing/InvoiceDetailScreen";
import { InvoicesScreen } from "@/features/invoicing/InvoicesScreen";
import { MyDayScreen } from "@/features/my-day/MyDayScreen";
import { PayoutDetailScreen } from "@/features/payouts/PayoutDetailScreen";
import { PayoutsScreen } from "@/features/payouts/PayoutsScreen";
import { ProjectDetailScreen } from "@/features/projects/ProjectDetailScreen";
import { ProjectsScreen } from "@/features/projects/ProjectsScreen";
import { ReportsScreen } from "@/features/reports/ReportsScreen";
import { TimesheetScreen } from "@/features/timesheets/TimesheetScreen";
import { useSession } from "@/lib/session";

function Root() {
  return <Outlet />;
}

/** Auth gate (meqenet LoginGate pattern): no session → login screen. */
function AuthenticatedLayout() {
  const { ready, userId } = useSession();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!userId) return <LoginScreen />;
  return <AppShell />;
}

const rootRoute = createRootRoute({ component: Root });

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AuthenticatedLayout,
});

const routes = [
  createRoute({ getParentRoute: () => appRoute, path: "/", component: MyDayScreen }),
  createRoute({ getParentRoute: () => appRoute, path: "/timesheet", component: TimesheetScreen }),
  createRoute({ getParentRoute: () => appRoute, path: "/approvals", component: ApprovalsScreen }),
  createRoute({ getParentRoute: () => appRoute, path: "/projects", component: ProjectsScreen }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/projects/$projectId",
    component: ProjectDetailScreen,
  }),
  createRoute({ getParentRoute: () => appRoute, path: "/clients", component: ClientsScreen }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/clients/$clientId",
    component: ClientDetailScreen,
  }),
  createRoute({ getParentRoute: () => appRoute, path: "/invoices", component: InvoicesScreen }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/invoices/$invoiceId",
    component: InvoiceDetailScreen,
  }),
  createRoute({ getParentRoute: () => appRoute, path: "/payouts", component: PayoutsScreen }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/payouts/$payoutId",
    component: PayoutDetailScreen,
  }),
  createRoute({ getParentRoute: () => appRoute, path: "/reports", component: ReportsScreen }),
  createRoute({ getParentRoute: () => appRoute, path: "/admin", component: AdminScreen }),
];

const routeTree = rootRoute.addChildren([appRoute.addChildren(routes)]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
