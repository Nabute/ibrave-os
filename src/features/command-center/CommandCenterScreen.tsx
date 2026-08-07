import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KpiRowSkeleton, ListSkeleton } from "@/components/Skeletons";
import { Link } from "@tanstack/react-router";
import { Activity, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { KpiTile } from "@/components/KpiTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toDisplayMessage, type ActivityFeedRow, type HealthLight } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { useApi } from "@/lib/session";
import { cn } from "@/lib/utils";

const HEALTH_DOT: Record<HealthLight, string> = {
  green: "bg-success-foreground",
  yellow: "bg-warning-foreground",
  red: "bg-destructive",
};

export function CommandCenterScreen() {
  const api = useApi();

  return (
    <div className="space-y-4">
      <div>
        <h1>Command Center</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Complete, drill-down transparency — every number links to the records that
          produced it. No dead ends.
        </p>
      </div>
      <Tabs defaultValue="pulse">
        <TabsList>
          <TabsTrigger value="pulse">Pulse</TabsTrigger>
          <TabsTrigger value="feed">Activity feed</TabsTrigger>
          <TabsTrigger value="engagements">Engagement board</TabsTrigger>
          <TabsTrigger value="pipeline">Two-sided pipeline</TabsTrigger>
          <TabsTrigger value="alerts">Alert rules</TabsTrigger>
        </TabsList>
        <TabsContent value="pulse">
          <PulseTab />
        </TabsContent>
        <TabsContent value="feed">
          <FeedTab />
        </TabsContent>
        <TabsContent value="engagements">
          <EngagementBoardTab />
        </TabsContent>
        <TabsContent value="pipeline">
          <TwoSidedPipelineTab />
        </TabsContent>
        <TabsContent value="alerts">
          <AlertRulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PulseTab() {
  const api = useApi();
  const { data: pulse, isLoading: pulseLoading } = useQuery({
    queryKey: ["command-pulse"],
    queryFn: () => api.commandCenter.pulse(),
    refetchInterval: 60_000,
  });

  if (!pulse) return null;

  const money = (n: number) => formatMinor(n, "USD");
  const collectRate =
    pulse.issued_mtd_minor > 0
      ? Math.round((100 * pulse.collected_mtd_minor) / pulse.issued_mtd_minor)
      : undefined;

  const tiles: Parameters<typeof KpiTile>[0][] = [
    { label: "Issued this month", value: money(pulse.issued_mtd_minor), to: "/invoices" },
    {
      label: "Cash collected",
      value: money(pulse.collected_mtd_minor),
      to: "/invoices",
      sub: collectRate != null ? `${collectRate}% of issued` : undefined,
      meterPct: collectRate,
    },
    { label: "Gross margin (MTD)", value: money(pulse.margin_mtd_minor), to: "/reports" },
    {
      label: "Overdue AR",
      value: money(pulse.overdue_ar_minor),
      to: "/reports",
      kind: pulse.overdue_ar_minor > 0 ? "critical" : "default",
    },
    { label: "Unbilled work", value: money(pulse.unbilled_minor), to: "/reports" },
    {
      label: "Utilization (MTD)",
      value: pulse.utilization_pct != null ? `${pulse.utilization_pct}%` : "—",
      to: "/reports",
      meterPct: pulse.utilization_pct ?? undefined,
    },
    {
      label: "Bench cost / week",
      value: money(pulse.bench_cost_weekly_minor),
      to: "/staffing",
      kind: pulse.bench_cost_weekly_minor > 0 ? "attention" : "default",
    },
    {
      label: "Weighted pipeline",
      value: money(pulse.weighted_pipeline_minor),
      to: "/sales",
      sub: `+ ${money(pulse.upsell_pipeline_minor)} upsell`,
    },
    {
      label: "Hiring",
      value: String(pulse.open_requisitions),
      to: "/recruiting",
      sub: `open reqs · ${pulse.candidates_in_pipeline} candidates in pipeline`,
    },
    {
      label: "Account health",
      value: `${pulse.red_accounts}·${pulse.yellow_accounts}`,
      to: "/clients",
      sub: "red · yellow accounts",
      kind: pulse.red_accounts > 0 ? "critical" : "positive",
    },
    {
      label: "Unsubmitted timesheets",
      value: String(pulse.unsubmitted_people),
      to: "/approvals",
      sub: "people, last week",
      kind: pulse.unsubmitted_people > 0 ? "attention" : "default",
    },
    {
      label: "Open escalations",
      value: String(pulse.open_escalations),
      to: "/clients",
      kind: pulse.open_escalations > 0 ? "attention" : "default",
    },
  ];

  if (pulseLoading) return <KpiRowSkeleton tiles={8} />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} />
      ))}
    </div>
  );
}

function FeedTab() {
  const api = useApi();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [live, setLive] = useState<ActivityFeedRow[]>([]);

  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ["activity-feed"],
    queryFn: () => api.commandCenter.activityFeed(),
  });

  useEffect(() => {
    return api.commandCenter.onFeedEvent((row) => setLive((l) => [row, ...l]));
  }, [api]);

  const rows = [...live, ...(feed ?? [])].filter(
    (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i
  );
  const types = [...new Set(rows.map((r) => r.event_type.split(".")[0]))].sort();
  const visible = rows.filter(
    (r) => filter === "all" || r.event_type.startsWith(filter)
  );

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            What happened while you were away — live via Realtime.
          </p>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ul className="space-y-2.5 text-sm">
          {feedLoading && <ListSkeleton rows={6} />}
          {visible.map((r) => (
            <li key={r.id} className="flex gap-3">
              <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
                {new Date(r.at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span>
                <Badge variant="outline" className="mr-1.5 align-middle">
                  {r.event_type}
                </Badge>
                {r.summary}
              </span>
            </li>
          ))}
          {visible.length === 0 && (
            <p className="py-4 text-center text-muted-foreground">No events yet.</p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function EngagementBoardTab() {
  const api = useApi();
  const { data: board } = useQuery({
    queryKey: ["engagement-board"],
    queryFn: () => api.commandCenter.engagementBoard(),
  });

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {(board ?? []).map((e) => (
        <Card
          key={e.project_id}
          className={cn(e.risk_score >= 40 && "border-destructive/50")}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{e.project_name}</CardTitle>
              {e.health && (
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", HEALTH_DOT[e.health])}
                  title={`health: ${e.health}`}
                />
              )}
            </div>
            <CardDescription>
              <Link
                to="/clients/$clientId"
                params={{ clientId: e.client_id }}
                className="hover:underline"
              >
                {e.client_name}
              </Link>{" "}
              · {e.billing_model.toUpperCase()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              {e.team_size} on team · {e.approved_hours ?? 0} h approved
              {e.burn_pct != null && (
                <span className={cn(Number(e.burn_pct) >= 90 && "font-semibold text-destructive")}>
                  {" "}· {e.burn_pct}% burn
                </span>
              )}
            </p>
            {e.overdue_ar_minor > 0 && (
              <p className="text-destructive">
                {formatMinor(e.overdue_ar_minor, "USD")} overdue
              </p>
            )}
            {e.renewal_date && <p>renews {e.renewal_date}</p>}
            <p className="text-xs">
              risk score <span className="tabular-nums">{e.risk_score}</span>
            </p>
          </CardContent>
        </Card>
      ))}
      {(board ?? []).length === 0 && (
        <p className="col-span-full py-8 text-center text-muted-foreground">
          No active engagements.
        </p>
      )}
    </div>
  );
}

function TwoSidedPipelineTab() {
  const api = useApi();
  const { data: rows } = useQuery({
    queryKey: ["two-sided-pipeline"],
    queryFn: () => api.commandCenter.twoSidedPipeline(6),
  });

  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Demand h (weighted)</TableHead>
              <TableHead className="text-right">Free capacity h</TableHead>
              <TableHead className="text-right">Hiring h</TableHead>
              <TableHead className="text-right">Net position</TableHead>
              <TableHead>Call</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((r) => (
              <TableRow key={r.month}>
                <TableCell className="font-medium">{r.month.slice(0, 7)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.demand_hours}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.supply_free_hours}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.hiring_hours}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    r.net_position < 0 && "text-destructive"
                  )}
                >
                  {r.net_position}
                </TableCell>
                <TableCell>
                  {r.net_position < 0 ? (
                    <Badge variant="destructive">hire faster</Badge>
                  ) : r.net_position > 300 ? (
                    <Badge variant="warning">sell harder</Badge>
                  ) : (
                    <Badge variant="success">balanced</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Demand = quoted hours on open deals × probability. Supply = free capacity plus
          candidates at offer/hired (~160 h/mo from their start month). The single most
          important owner decision — sell harder or hire faster — answered with live
          data.
        </p>
      </CardContent>
    </Card>
  );
}

const METRICS = [
  { key: "overdue_ar_minor", label: "Overdue AR (cents)" },
  { key: "red_accounts", label: "Red accounts" },
  { key: "unsubmitted_people", label: "Unsubmitted people" },
  { key: "bench_cost_weekly_minor", label: "Bench cost/week (cents)" },
  { key: "weighted_pipeline_minor", label: "Weighted pipeline (cents)" },
  { key: "open_escalations", label: "Open escalations" },
];

function AlertRulesTab() {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ metric: "overdue_ar_minor", comparator: "gt", threshold: "" });

  const { data: rules } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: () => api.commandCenter.alertRules(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["alert-rules"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.commandCenter.saveAlertRule({
        metric: form.metric,
        comparator: form.comparator as "gt" | "lt",
        threshold: Number(form.threshold),
      }),
    onSuccess: () => {
      setForm({ ...form, threshold: "" });
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.commandCenter.deleteAlertRule(id),
    onSuccess: invalidate,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Owner alert rules</CardTitle>
        <CardDescription>
          Evaluated every morning; crossings arrive as notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={form.comparator}
            onValueChange={(v) => setForm({ ...form, comparator: v })}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gt">above</SelectItem>
              <SelectItem value="lt">below</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="w-36"
            placeholder="threshold"
            value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
          />
          <Button
            disabled={!form.threshold || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <Plus className="h-4 w-4" /> Add rule
          </Button>
        </div>
        <ul className="divide-y">
          {(rules ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {METRICS.find((m) => m.key === r.metric)?.label ?? r.metric}{" "}
                <Badge variant="outline">
                  {r.comparator === "gt" ? ">" : "<"} {r.threshold.toLocaleString()}
                </Badge>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                aria-label="Delete rule"
                onClick={() => deleteMutation.mutate(r.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
          
