import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMinor } from "@/lib/money";
import { useApi, useSession } from "@/lib/session";

/**
 * Talent 360 (H-7): profile + skills + automatic engagement history +
 * utilization + rates. Print = the client-ready profile (H-10): rates and
 * internal data carry no-print so they never reach a client export.
 */
export function PersonDetailScreen() {
  const { personId } = useParams({ strict: false }) as { personId: string };
  const api = useApi();
  const { hasRole } = useSession();

  const { data: person } = useQuery({
    queryKey: ["person", personId],
    queryFn: () => api.talent.person(personId),
  });
  const { data: history } = useQuery({
    queryKey: ["engagements", personId],
    queryFn: () => api.talent.engagementHistory(personId),
  });
  const { data: utilization } = useQuery({
    queryKey: ["person-utilization", personId],
    queryFn: () => api.talent.utilization(personId),
  });
  const { data: skills } = useQuery({
    queryKey: ["person-skills-all"],
    queryFn: () => api.staffing.personSkills(),
  });
  const { data: costRates } = useQuery({
    queryKey: ["person-cost-rates"],
    queryFn: () => api.payouts.costRates(),
    enabled: hasRole("finance"),
  });
  const { data: timeOff } = useQuery({
    queryKey: ["time-off"],
    queryFn: () => api.staffing.timeOff(),
  });

  if (!person) return null;

  const mySkills = (skills ?? []).filter((s) => s.user_id === personId);
  const myRates = (costRates ?? []).filter((r) => r.user_id === personId);
  const myTimeOff = (timeOff ?? []).filter((t) => t.user_id === personId);
  const hasSideCards =
    (hasRole("finance") && myRates.length > 0) || myTimeOff.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{person.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {person.title ?? "—"} · {person.employment_type} ·{" "}
            {person.weekly_capacity_hours} h/week capacity
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="no-print">
          <Printer className="h-4 w-4" /> Client-ready profile
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {mySkills.map((s) => (
          <Badge key={s.skill_id} variant="secondary">
            {s.skills?.name} · {s.level}
          </Badge>
        ))}
        {mySkills.length === 0 && (
          <p className="text-sm text-muted-foreground">No skills recorded yet.</p>
        )}
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Engagement history</CardTitle>
          <p className="text-sm text-muted-foreground">
            Derived from assignments + approved hours — always current, maintained by
            nobody.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Hours delivered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history ?? []).map((e) => (
                <TableRow key={e.assignment_id}>
                  <TableCell className="font-medium">{e.project_name}</TableCell>
                  <TableCell>{e.client_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.role_on_project ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.start_date} → {e.end_date ?? "ongoing"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.approved_hours}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Utilization spans the free space when there are no side cards —
          no half-empty rows on wide screens. */}
      <div className="no-print grid gap-4 lg:grid-cols-2">
        <Card className={!hasSideCards ? "lg:col-span-2" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Utilization (approved h)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {(utilization ?? []).map((u) => (
                  <TableRow key={u.month}>
                    <TableCell>{u.month.slice(0, 7)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.billable_hours ?? 0} billable / {u.total_hours} total
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.billable_pct ?? 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {hasSideCards && (
        <div className="space-y-4">
          {hasRole("finance") && myRates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Cost rate history</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {myRates.map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <span className="text-muted-foreground">from {r.effective_from}</span>
                      <span className="tabular-nums">
                        {r.hourly_cost_minor != null
                          ? `${formatMinor(r.hourly_cost_minor, r.currency)}/h`
                          : `${formatMinor(r.monthly_cost_minor!, r.currency)}/mo`}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {myTimeOff.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Time off</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {myTimeOff.map((t) => (
                    <li key={t.id}>
                      {t.start_date} → {t.end_date} · {t.kind.replace("_", " ")}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
