import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BellOff } from "lucide-react";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { CardGridSkeleton } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor } from "@/lib/money";
import { hasSeenCurrentTour, startTour, tourTargetsReady } from "@/lib/onboarding";
import { useApi, useSession } from "@/lib/session";

export function MyDayScreen() {
  const api = useApi();
  const { profile } = useSession();
  const qc = useQueryClient();

  const { data: day, isLoading } = useQuery({ queryKey: ["my-day"], queryFn: () => api.workspace.myDay() });
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.workspace.notifications(),
  });

  // First-visit product tour: only after the dashboard data (and therefore
  // the tour's target elements) has rendered. Retries across a few frames in
  // case a card mounts a beat later; never runs once seen/skipped.
  useEffect(() => {
    if (!day || hasSeenCurrentTour()) return;
    let attempts = 0;
    let raf = 0;
    const tryStart = () => {
      if (hasSeenCurrentTour()) return;
      if (tourTargetsReady()) {
        startTour();
      } else if (attempts++ < 30) {
        raf = requestAnimationFrame(tryStart);
      } else {
        startTour(); // partial tour beats no tour — missing steps are filtered
      }
    };
    raf = requestAnimationFrame(tryStart);
    return () => cancelAnimationFrame(raf);
  }, [day]);

  const unread = (notifications ?? []).filter((n) => !n.read_at);

  return (
    <div className="space-y-6">
      <div data-tour="my-day-header">
        <h1>
          Good morning, {profile?.full_name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything below needs your action or decision. Empty screen = done for the day.
        </p>
      </div>

      {isLoading && <CardGridSkeleton cards={3} />}
      <div data-tour="my-day-cards" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {day?.timesheet && (
          <Card className="transition-shadow duration-fast ease-ledger">
            <CardHeader className="pb-2">
              <CardDescription>This week's timesheet</CardDescription>
              <CardTitle className="text-xl">
                {Number(day.timesheet.draft_hours) +
                  Number(day.timesheet.submitted_hours) +
                  Number(day.timesheet.approved_hours)}{" "}
                h logged
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2 text-sm">
                <Badge variant="secondary">{day.timesheet.draft_hours} h draft</Badge>
                <Badge variant="warning">{day.timesheet.submitted_hours} h submitted</Badge>
                <Badge variant="success">{day.timesheet.approved_hours} h approved</Badge>
              </div>
              {day.timesheet.rejected_count > 0 && (
                <p className="text-sm font-medium text-destructive">
                  {day.timesheet.rejected_count} rejected {day.timesheet.rejected_count === 1 ? "entry needs" : "entries need"} correction
                </p>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to="/timesheet">
                  Open timesheet <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {day?.tasks && day.tasks.due_today > 0 && (
          <Card className="transition-shadow duration-fast ease-ledger">
            <CardHeader className="pb-2">
              <CardDescription>Task queue</CardDescription>
              <CardTitle className="text-xl">
                {day.tasks.due_today} due today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {day.tasks.overdue > 0 && `${day.tasks.overdue} overdue · `}
                {day.tasks.upcoming} upcoming
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/prospecting">
                  Open today view <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {day?.approvals && day.approvals.pending_count > 0 && (
          <Card className="transition-shadow duration-fast ease-ledger">
            <CardHeader className="pb-2">
              <CardDescription>Approvals queue</CardDescription>
              <CardTitle className="text-xl">
                {day.approvals.pending_count} entries waiting
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                From {day.approvals.people} {day.approvals.people === 1 ? "person" : "people"}
                {day.approvals.oldest_submission &&
                  ` · oldest ${new Date(day.approvals.oldest_submission).toLocaleDateString()}`}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/approvals">
                  Review <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {day?.finance && (
          <Card className="transition-shadow duration-fast ease-ledger">
            <CardHeader className="pb-2">
              <CardDescription>Finance</CardDescription>
              <CardTitle className="text-xl">
                {day.finance.draft_invoices} drafts · {day.finance.overdue_invoices} overdue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Overdue AR {formatMinor(day.finance.overdue_minor, "USD")} · Unbilled{" "}
                {formatMinor(day.finance.unbilled_minor, "USD")}
                {day.finance.payouts_to_confirm > 0 &&
                  ` · ${day.finance.payouts_to_confirm} payout ${
                    day.finance.payouts_to_confirm === 1 ? "draft" : "drafts"
                  } to confirm`}
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/invoices">
                    Invoices <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                {day.finance.payouts_to_confirm > 0 && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/payouts">
                      Payouts <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {day?.pulse && (
          <Card className="transition-shadow duration-fast ease-ledger">
            <CardHeader className="pb-2">
              <CardDescription>Company pulse</CardDescription>
              <CardTitle className="text-xl">
                {formatMinor(day.pulse.issued_this_month_minor, "USD")} issued this month
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>{formatMinor(day.pulse.collected_this_month_minor, "USD")} collected</p>
              <p>{formatMinor(day.pulse.margin_this_month_minor, "USD")} gross margin</p>
              <p>
                {day.pulse.unsubmitted_people}{" "}
                {day.pulse.unsubmitted_people === 1 ? "person hasn't" : "people haven't"}{" "}
                submitted last week
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {unread.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <BellOff className="h-4 w-4" /> Nothing unread.
            </p>
          )}
          <ul className="divide-y">
            {unread.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-4 py-2">
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api.workspace.markRead(n.id);
                    void qc.invalidateQueries({ queryKey: ["notifications"] });
                  }}
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
