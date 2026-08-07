import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListSkeleton, TableSkeleton } from "@/components/Skeletons";
import { CalendarCheck2, CheckCircle2, Plus, Star } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { toDisplayMessage, type Prospect } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";

export function ProspectingScreen() {
  return (
    <div className="space-y-4">
      <div>
        <h1>Prospecting</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The system schedules the touches and remembers everything — a human presses
          send.
        </p>
      </div>
      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="prospects">Prospects</TabsTrigger>
          <TabsTrigger value="cadences">Cadences</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
        </TabsList>
        <TabsContent value="today">
          <TodayTab />
        </TabsContent>
        <TabsContent value="prospects">
          <ProspectsTab />
        </TabsContent>
        <TabsContent value="cadences">
          <CadencesTab />
        </TabsContent>
        <TabsContent value="funnel">
          <FunnelTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A-0.3: the task queue. Completing a touch schedules the next cadence step. */
function TodayTab() {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["sales-tasks"],
    queryFn: () => api.prospecting.myTasks(),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.prospecting.completeTask(id, note || undefined),
    onSuccess: () => {
      setCompleting(null);
      setNote("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["sales-tasks"] });
      void qc.invalidateQueries({ queryKey: ["my-day"] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const today = new Date().toISOString().slice(0, 10);
  const due = (tasks ?? []).filter((t) => t.due_date <= today);
  const upcoming = (tasks ?? []).filter((t) => t.due_date > today);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Card>
        <CardContent className="pt-4">
          {due.length === 0 && (
            <EmptyState
              icon={CalendarCheck2}
              sentence="Nothing due — genuinely done for the day"
              description="Cadence touches and account check-ins appear here on their day. Start a cadence on a prospect to fill tomorrow."
            />
          )}
          <ul className="divide-y">
            {due.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="text-sm">
                  <Badge
                    variant={t.due_date < today ? "destructive" : "warning"}
                    className="mr-2 align-middle"
                  >
                    {t.due_date < today ? "overdue" : t.kind}
                  </Badge>
                  <span className="font-medium">
                    {t.prospects?.company ?? t.clients?.name}
                  </span>
                  <span className="ml-2 text-muted-foreground">{t.description}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setCompleting(t.id)}>
                  <CheckCircle2 className="h-4 w-4" /> Done
                </Button>
              </li>
            ))}
          </ul>
          {upcoming.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {upcoming.length} upcoming: next on {upcoming[0].due_date} —{" "}
              {upcoming[0].description}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Logging completes the touch and schedules the next cadence step automatically.
          </p>
          <Textarea
            placeholder="What happened? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <DialogFooter>
            <Button
              disabled={completeMutation.isPending}
              onClick={() => completing && completeMutation.mutate({ id: completing, note })}
            >
              Mark done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PROSPECT_BADGE: Record<Prospect["status"], "secondary" | "success" | "outline" | "destructive"> = {
  active: "secondary",
  converted: "success",
  disqualified: "outline",
  dnc: "destructive",
};

function ProspectsTab() {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [starting, setStarting] = useState<Prospect | null>(null);
  const [cadenceId, setCadenceId] = useState("");
  const [form, setForm] = useState({
    company: "",
    contact_name: "",
    email: "",
    industry: "",
    source: "research",
    fit_score: "3",
  });

  const { data: prospects, isLoading: prospectsLoading } = useQuery({
    queryKey: ["prospects"],
    queryFn: () => api.prospecting.prospects(),
  });
  const { data: cadences } = useQuery({
    queryKey: ["cadences"],
    queryFn: () => api.prospecting.cadences(),
  });
  const { data: runs } = useQuery({
    queryKey: ["cadence-runs"],
    queryFn: () => api.prospecting.runs(),
  });

  const activeRunByProspect = new Map(
    (runs ?? []).filter((r) => r.status === "active").map((r) => [r.prospect_id, r])
  );

  const invalidate = () => {
    ["prospects", "cadence-runs", "sales-tasks", "prospect-funnel", "leads"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] })
    );
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.prospecting.createProspect({
        company: form.company,
        contact_name: form.contact_name || null,
        email: form.email || null,
        industry: form.industry || null,
        source: form.source,
        fit_score: Number(form.fit_score),
        owner_id: userId,
      }),
    onSuccess: () => {
      setShowNew(false);
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const startMutation = useMutation({
    mutationFn: () => api.prospecting.startCadence(starting!.id, cadenceId),
    onSuccess: () => {
      setStarting(null);
      setCadenceId("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => api.prospecting.convert(id),
    onSuccess: invalidate,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const dncMutation = useMutation({
    mutationFn: (id: string) => api.prospecting.prospectAction(id, "mark_dnc"),
    onSuccess: invalidate,
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
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New prospect
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New prospect</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Company</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Contact</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Industry</Label>
                <Input
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Source</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm({ ...form, source: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["referral", "event", "inbound", "research", "outbound", "other"].map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Fit score</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`Fit ${n} of 5`}
                      onClick={() => setForm({ ...form, fit_score: String(n) })}
                      className="rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Star
                        className={
                          n <= Number(form.fit_score)
                            ? "h-5 w-5 fill-warning-foreground text-warning-foreground"
                            : "h-5 w-5 text-muted-foreground"
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!form.company || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Add prospect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-4">
          {prospectsLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Fit</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status / cadence</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(prospects ?? []).map((p) => {
                const run = activeRunByProspect.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="font-medium">{p.company}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.contact_name}
                        {p.industry && ` · ${p.industry}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-warning-foreground">
                        {"★".repeat(p.fit_score)}
                      </span>
                      <span className="text-muted-foreground">
                        {"★".repeat(5 - p.fit_score)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.source}</TableCell>
                    <TableCell>
                      <Badge variant={PROSPECT_BADGE[p.status]}>{p.status}</Badge>
                      {run && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {run.cadences?.name} · step {run.current_step + 1}/
                          {run.cadences?.steps.length}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === "active" && (
                        <div className="flex justify-end gap-1.5">
                          {!run && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setStarting(p)}
                            >
                              Start cadence
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => convertMutation.mutate(p.id)}
                            disabled={convertMutation.isPending}
                          >
                            → Lead
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => dncMutation.mutate(p.id)}
                            title="Do not contact"
                          >
                            DNC
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!starting} onOpenChange={(o) => !o && setStarting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start cadence — {starting?.company}</DialogTitle>
          </DialogHeader>
          <Select value={cadenceId} onValueChange={setCadenceId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a cadence" />
            </SelectTrigger>
            <SelectContent>
              {(cadences ?? [])
                .filter((c) => c.active)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.steps.length} steps)
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              disabled={!cadenceId || startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              Start — first touch lands in Today
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CadencesTab() {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [stepsText, setStepsText] = useState(
    "0 email Intro + case study\n3 linkedin Connect with short note\n7 call Reference the case study"
  );

  const { data: cadences } = useQuery({
    queryKey: ["cadences"],
    queryFn: () => api.prospecting.cadences(),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const steps = stepsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [day, kind, ...rest] = line.split(/\s+/);
          return { day_offset: Number(day) || 0, kind: kind ?? "email", note: rest.join(" ") };
        });
      if (steps.length === 0) throw new Error("At least one step required");
      return api.prospecting.createCadence(name, steps);
    },
    onSuccess: () => {
      setOpen(false);
      setName("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["cadences"] });
    },
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
              <Plus className="h-4 w-4" /> New cadence
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New cadence</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Steps — one per line: “day kind note…”</Label>
                <Textarea
                  rows={5}
                  value={stepsText}
                  onChange={(e) => setStepsText(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!name || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(cadences ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-4">
              <p className="mb-2 font-medium">{c.name}</p>
              <ol className="space-y-1 text-sm text-muted-foreground">
                {c.steps.map((s, i) => (
                  <li key={i}>
                    Day {s.day_offset} — <Badge variant="outline">{s.kind}</Badge>{" "}
                    {s.note}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FunnelTab() {
  const api = useApi();
  const { data: funnel } = useQuery({
    queryKey: ["prospect-funnel"],
    queryFn: () => api.prospecting.funnel(),
  });

  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Prospects</TableHead>
              <TableHead className="text-right">Contacted</TableHead>
              <TableHead className="text-right">→ Leads</TableHead>
              <TableHead className="text-right">→ Won</TableHead>
              <TableHead className="text-right">DNC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(funnel ?? []).map((r) => (
              <TableRow key={r.source}>
                <TableCell className="font-medium">{r.source}</TableCell>
                <TableCell className="text-right tabular-nums">{r.prospects}</TableCell>
                <TableCell className="text-right tabular-nums">{r.contacted}</TableCell>
                <TableCell className="text-right tabular-nums">{r.converted}</TableCell>
                <TableCell className="text-right tabular-nums">{r.won}</TableCell>
                <TableCell className="text-right tabular-nums">{r.dnc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Which channels actually produce clients — prospects → conversations →
          qualified leads → won, by source.
        </p>
      </CardContent>
    </Card>
  );
}
