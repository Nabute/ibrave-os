import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarOff, UserPlus } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { toDisplayMessage, type StaffingRequest } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { useApi, useSession } from "@/lib/session";

export function StaffingScreen() {
  return (
    <div className="space-y-4">
      <div>
        <h1>Staffing</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Who is available, who is billable, and who fits the next request.
        </p>
      </div>
      <Tabs defaultValue="bench">
        <TabsList>
          <TabsTrigger value="bench">Bench</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="timeoff">Time off</TabsTrigger>
        </TabsList>
        <TabsContent value="bench">
          <BenchTab />
        </TabsContent>
        <TabsContent value="requests">
          <RequestsTab />
        </TabsContent>
        <TabsContent value="capacity">
          <CapacityTab />
        </TabsContent>
        <TabsContent value="timeoff">
          <TimeOffTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BenchTab() {
  const api = useApi();
  const { data: bench } = useQuery({
    queryKey: ["bench"],
    queryFn: () => api.staffing.bench(),
  });
  const showCost = (bench ?? []).some((r) => r.weekly_bench_cost_minor != null);

  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">Bench</TableHead>
              <TableHead>Time off (4 wks)</TableHead>
              {showCost && <TableHead className="text-right">Bench cost / wk</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(bench ?? []).map((r) => (
              <TableRow key={r.user_id}>
                <TableCell>
                  <span className="font-medium">{r.full_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.title ?? r.employment_type}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.skills.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.committed_allocation_pct}%
                </TableCell>
                <TableCell className="text-right">
                  {r.under_allocated ? (
                    <Badge variant="warning">{r.bench_pct}% free</Badge>
                  ) : (
                    <span className="tabular-nums text-muted-foreground">{r.bench_pct}%</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.time_off_days > 0 ? `${r.time_off_days} d` : "—"}
                </TableCell>
                {showCost && (
                  <TableCell className="text-right tabular-nums">
                    {r.weekly_bench_cost_minor != null && r.weekly_bench_cost_minor > 0
                      ? formatMinor(r.weekly_bench_cost_minor, "USD")
                      : "—"}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Anyone under 80% allocated is flagged. Bench cost = free capacity × cost rate
          (visible to finance/owner only).
        </p>
      </CardContent>
    </Card>
  );
}

function RequestsTab() {
  const api = useApi();
  const qc = useQueryClient();
  const { hasRole } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<StaffingRequest | null>(null);
  const [cancelComment, setCancelComment] = useState("");

  const { data: requests } = useQuery({
    queryKey: ["staffing-requests"],
    queryFn: () => api.staffing.requests(),
  });
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });
  const { data: skills } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.staffing.skills(),
  });
  const { data: candidates } = useQuery({
    queryKey: ["candidates", expanded],
    queryFn: () => api.staffing.suggestCandidates(expanded!),
    enabled: !!expanded,
  });

  const [form, setForm] = useState({
    project_id: "",
    role_title: "",
    skills: [] as string[],
    seniority: "",
    allocation_pct: "100",
    start_date: format(new Date(), "yyyy-MM-dd"),
    duration_weeks: "12",
    notes: "",
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["staffing-requests"] });
    void qc.invalidateQueries({ queryKey: ["bench"] });
    void qc.invalidateQueries({ queryKey: ["capacity"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.staffing.createRequest({
        project_id: form.project_id || null,
        role_title: form.role_title,
        skills: form.skills,
        seniority: form.seniority || null,
        allocation_pct: Number(form.allocation_pct),
        start_date: form.start_date,
        duration_weeks: form.duration_weeks ? Number(form.duration_weeks) : null,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const fillMutation = useMutation({
    mutationFn: ({ requestId, userId }: { requestId: string; userId: string }) =>
      api.staffing.fillRequest(requestId, userId),
    onSuccess: () => {
      setError(null);
      setExpanded(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment: string }) =>
      api.staffing.cancelRequest(requestId, comment),
    onSuccess: () => {
      setCancelling(null);
      setCancelComment("");
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const canManage = hasRole("resourcing");

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4" /> New request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New staffing request</DialogTitle>
                <DialogDescription>
                  The system suggests candidates ranked by skill match and availability.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Project</Label>
                  <Select
                    value={form.project_id}
                    onValueChange={(v) => setForm({ ...form, project_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {(projects ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Role title</Label>
                  <Input
                    value={form.role_title}
                    onChange={(e) => setForm({ ...form, role_title: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Seniority</Label>
                  <Select
                    value={form.seniority}
                    onValueChange={(v) => setForm({ ...form, seniority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="junior">junior</SelectItem>
                      <SelectItem value="mid">mid</SelectItem>
                      <SelectItem value="senior">senior</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Skills</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(skills ?? []).map((s) => {
                      const selected = form.skills.includes(s.name);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              skills: selected
                                ? form.skills.filter((n) => n !== s.name)
                                : [...form.skills, s.name],
                            })
                          }
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            selected
                              ? "border-transparent bg-primary text-primary-foreground"
                              : "hover:bg-accent"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Allocation %</Label>
                  <Input
                    type="number"
                    min={5}
                    max={100}
                    value={form.allocation_pct}
                    onChange={(e) => setForm({ ...form, allocation_pct: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Duration (weeks)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.duration_weeks}
                    onChange={(e) => setForm({ ...form, duration_weeks: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!form.role_title || !form.project_id || createMutation.isPending}
                >
                  Create request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {(requests ?? []).map((req) => (
        <Card key={req.id}>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">
                  {req.role_title}
                  <Badge
                    className="ml-2 align-middle"
                    variant={
                      req.status === "open"
                        ? "warning"
                        : req.status === "filled"
                          ? "success"
                          : "secondary"
                    }
                  >
                    {req.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {req.projects?.name ?? "No project"} · {req.allocation_pct}% from{" "}
                  {req.start_date}
                  {req.duration_weeks && ` · ${req.duration_weeks} wks`}
                  {req.skills.length > 0 && ` · ${req.skills.join(", ")}`}
                </p>
              </div>
              {req.status === "open" && canManage && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpanded(expanded === req.id ? null : req.id)}
                  >
                    {expanded === req.id ? "Hide candidates" : "Suggest candidates"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setCancelling(req)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {expanded === req.id && (
              <div className="mt-4 rounded-lg border bg-muted/40 p-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Matched skills</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(candidates ?? []).map((c) => (
                      <TableRow key={c.user_id}>
                        <TableCell>
                          <span className="font-medium">{c.full_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{c.title}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {c.matched_skills.map((s) => (
                              <Badge key={s} variant="success">
                                {s}
                              </Badge>
                            ))}
                            {c.matched_skills.length === 0 && (
                              <span className="text-xs text-muted-foreground">none</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.available_pct}%
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {c.score}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() =>
                              fillMutation.mutate({ requestId: req.id, userId: c.user_id })
                            }
                            disabled={fillMutation.isPending}
                          >
                            Assign
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {(requests ?? []).length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No staffing requests.
          </CardContent>
        </Card>
      )}

      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel request</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Why is this request being cancelled? (required)"
            value={cancelComment}
            onChange={(e) => setCancelComment(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={cancelComment.trim() === "" || cancelMutation.isPending}
              onClick={() =>
                cancelling &&
                cancelMutation.mutate({ requestId: cancelling.id, comment: cancelComment })
              }
            >
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CapacityTab() {
  const api = useApi();
  const { data: forecast } = useQuery({
    queryKey: ["capacity"],
    queryFn: () => api.staffing.capacityForecast(6),
  });

  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Capacity h</TableHead>
              <TableHead className="text-right">Committed h</TableHead>
              <TableHead className="text-right">Time off h</TableHead>
              <TableHead className="text-right">Free h</TableHead>
              <TableHead className="text-right">Utilization</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(forecast ?? []).map((m) => (
              <TableRow key={m.month}>
                <TableCell className="font-medium">{m.month.slice(0, 7)}</TableCell>
                <TableCell className="text-right tabular-nums">{m.capacity_hours}</TableCell>
                <TableCell className="text-right tabular-nums">{m.committed_hours}</TableCell>
                <TableCell className="text-right tabular-nums">{m.time_off_hours}</TableCell>
                <TableCell className="text-right tabular-nums">{m.free_hours}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.utilization_pct != null ? `${m.utilization_pct}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Committed allocations vs total capacity — "do we hire or do we sell?" Weighted
          pipeline demand joins this view when the Sales module lands.
        </p>
      </CardContent>
    </Card>
  );
}

function TimeOffTab() {
  const api = useApi();
  const qc = useQueryClient();
  const { userId, hasRole, profile } = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
    kind: "vacation",
    note: "",
  });

  const { data: entries } = useQuery({
    queryKey: ["time-off"],
    queryFn: () => api.staffing.timeOff(),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.staffing.addTimeOff({
        user_id: userId!,
        ...form,
        note: form.note || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["time-off"] });
      void qc.invalidateQueries({ queryKey: ["bench"] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.staffing.removeTimeOff(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["time-off"] }),
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <CalendarOff className="h-4 w-4" /> Record time off
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record time off</DialogTitle>
              <DialogDescription>
                For {profile?.full_name}. Reduces capacity in forecasts.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">vacation</SelectItem>
                    <SelectItem value="sick">sick</SelectItem>
                    <SelectItem value="public_holiday">public holiday</SelectItem>
                    <SelectItem value="other">other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Note</Label>
                <Input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entries ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.profiles?.full_name}</TableCell>
                  <TableCell>{t.start_date}</TableCell>
                  <TableCell>{t.end_date}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t.kind.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.note ?? ""}</TableCell>
                  <TableCell className="text-right">
                    {(t.user_id === userId || hasRole("resourcing")) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeMutation.mutate(t.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
