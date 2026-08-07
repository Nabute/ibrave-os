import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export function PrivacyNoticeScreen() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center justify-between gap-4">
          <span className="font-display text-xl">ibrave OS</span>
          <Button asChild variant="outline">
            <Link to="/">Open workspace</Link>
          </Button>
        </div>

        <section className="space-y-3">
          <h1>Privacy notice</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            ibrave OS is an internal operations workspace for time tracking, approvals,
            invoicing, staffing, recruiting, sales, calendar activity, notifications, and
            related communications.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl">Data categories</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The workspace processes account identity data, roles, timesheets, assignments,
            time off, invoices, payment records, candidate and prospect records, email logs,
            calendar attendance, preferences, notifications, and audit events.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl">Storage on this device</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The app uses strictly necessary browser storage for authentication and workspace
            preferences such as theme, sidebar state, and onboarding state. It does not use
            advertising cookies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl">Your requests</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Signed-in users can use the Privacy Center to export their own workspace data
            and submit access, portability, rectification, erasure, restriction, objection,
            or other privacy requests.
          </p>
        </section>
      </div>
    </main>
  );
}
