import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, UserRoundPlus } from "lucide-react";
import { useState } from "react";

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
import { toDisplayMessage, type Candidate, type CandidateStage } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { useApi, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CandidateDialog } from "./CandidateDialog";

const PIPELINE_STAGES: { key: CandidateStage; label: string }[] = [
  { key: "sourced", label: "Sourced" },
  { key: "screening", label: "Screening" },
  { key: "interview", label: "Interview" },
  { key: "assessment", label: "Assessment" },
  { key: "offer", label: "Offer" },
];

export const CANDIDATE_BADGE: Record<
  CandidateStage,
  "secondary" | "default" | "warning" | "success" | "destructive" | "outline"
> = {
  sourced: "secondary",
  screening: "default",
  interview: "warning",
  assessment: "warning",
  offer: "warning",
  hired: "success",
  rejected: "destructive",
  talent_pool: "outline",
};

export function RecruitingScreen() {
  const api = useApi();
  const [openCandidate, setOpenCandidate] = useState<Candidate | null>(null);

  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: () => api.talent.candidates(),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl">Recruiting</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The supply side, run with the same rigor as sales. Your cheapest hire is one
          you already interviewed.
        </p>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="pool">Talent pool</TabsTrigger>
          <TabsTrigger value="requisitions">Requisitions</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <PipelineTab
            candidates={candidates ?? []}
            onOpen={setOpenCandidate}
          />
        </TabsContent>
        <TabsContent value="pool">
          <PoolTab candidates={candidates ?? []} onOpen={setOpenCandidate} />
        </TabsContent>
        <TabsContent value="requisitions">
          <RequisitionsTab />
        </TabsContent>
        <TabsContent value="onboarding">
          <OnboardingTab />
        </TabsContent>
        <TabsContent value="analytics">
          <AnalyticsTab />
        </TabsContent>
      </Tabs>

      {openCandidate && (
        <CandidateDialog
          candidate={openCandidate}
          onClose={() => setOpenCandidate(null)}
        />
      )}
    </div>
  );
}

function PipelineTab({
  candidates,
  onOpen,
}: {
  candidates: Candidate[];
  onOpen: (c: Candidate) => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: requisitions } = useQuery({
    queryKey: ["requisitions"],
    queryFn: () => api.talent.requisitions(),
  });
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    skills: "",
    seniority: "",
    source: "referral",
    requisition_id: "",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.talent.createCandidate({
        full_name: form.full_name,
        email: form.email || null,
        skills: form.skills.split(/[,;\s]+/).filter(Boolean),
        seniority: (form.seniority || null) as never,
        source: form.source,
        requisition_id: form.requisition_id || null,
        owner_id: userId,
      }),
    onSuccess: () => {
      setShowNew(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const closed = candidates.filter((c) => c.stage === "hired" || c.stage === "rejected");

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {closed.filter((c) => c.stage === "hired").length} hired ·{" "}
          {closed.filter((c) => c.stage === "rejected").length} rejected (all time)
        </p>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button>
              <UserRoundPlus className="h-4 w-4" /> New candidate
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New candidate</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Full name</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
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
                <Label>Skills (comma-sep)</Label>
                <Input
                  value={form.skills}
                  onChange={(e) => setForm({ ...form, skills: e.target.value })}
                  placeholder="node, postgres"
                />
              </div>
              <div className="space-y-1">
                <Label>Seniority</Label>
                <Select
                  value={form.seniority}
                  onValueChange={(v) => setForm({ ...form, seniority: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {["junior", "mid", "senior"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    {["referral", "linkedin", "job_board", "inbound", "agency", "other"].map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace("_", " ")}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Requisition</Label>
                <Select
                  value={form.requisition_id}
                  onValueChange={(v) => setForm({ ...form, requisition_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {(requisitions ?? [])
                      .filter((r) => r.status === "open")
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.role_title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!form.full_name || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Add candidate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {PIPELINE_STAGES.map((stage) => {
          const stageCandidates = candidates.filter((c) => c.stage === stage.key);
          return (
            <div key={stage.key} className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <p className="text-sm font-semibold">{stage.label}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {stageCandidates.length}
                </p>
              </div>
              <div className="min-h-24 space-y-2 rounded-lg bg-muted/50 p-2">
                {stageCandidates.map((c) => (
                  <motion.button
                    key={c.id}
                    layout
                    onClick={() => onOpen(c)}
                    className={cn(
                      "w-full rounded-lg border bg-card p-3 text-left shadow-card transition-shadow",
                      "hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    <p className="font-medium leading-tight">{c.full_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.requisitions?.role_title ?? c.skills.slice(0, 3).join(", ")}
                      {c.seniority && ` · ${c.seniority}`}
                    </p>
                  </motion.button>
                ))}
                {stageCandidates.length === 0 && (
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                    empty
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PoolTab({
  candidates,
  onOpen,
}: {
  candidates: Candidate[];
  onOpen: (c: Candidate) => void;
}) {
  const pool = candidates.filter((c) => c.stage === "talent_pool");
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          Strong candidates parked for later — searched first when a requisition opens
          (H-4).
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead>Seniority</TableHead>
              <TableHead>Available from</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pool.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => onOpen(c)}>
                <TableCell className="font-medium">{c.full_name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.skills.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{c.seniority ?? "—"}</TableCell>
                <TableCell>{c.available_from ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pool.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">Pool is empty.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RequisitionsTab() {
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    role_title: "",
    skills: "",
    seniority: "",
    headcount: "1",
    reason: "growth",
  });

  const { data: requisitions } = useQuery({
    queryKey: ["requisitions"],
    queryFn: () => api.talent.requisitions(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.talent.createRequisition({
        role_title: form.role_title,
        skills: form.skills.split(/[,;\s]+/).filter(Boolean),
        seniority: (form.seniority || null) as never,
        headcount: Number(form.headcount),
        reason: form.reason as never,
      }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["requisitions"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Open requisition
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Open requisition</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Role title</Label>
                <Input
                  value={form.role_title}
                  onChange={(e) => setForm({ ...form, role_title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Skills</Label>
                <Input
                  value={form.skills}
                  onChange={(e) => setForm({ ...form, skills: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Seniority</Label>
                <Select
                  value={form.seniority}
                  onValueChange={(v) => setForm({ ...form, seniority: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="any" />
                  </SelectTrigger>
                  <SelectContent>
                    {["junior", "mid", "senior"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Headcount</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.headcount}
                  onChange={(e) => setForm({ ...form, headcount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Reason</Label>
                <Select
                  value={form.reason}
                  onValueChange={(v) => setForm({ ...form, reason: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["growth", "backfill", "staffing_request"].map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!form.role_title || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Open
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
                <TableHead>Role</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead className="text-right">Headcount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requisitions ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.role_title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.skills.join(", ")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.headcount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.reason.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.status === "open"
                          ? "warning"
                          : r.status === "filled"
                            ? "success"
                            : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.opened_at).toLocaleDateString()}
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

function OnboardingTab() {
  const api = useApi();
  const qc = useQueryClient();
  const { data: tasks } = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api.talent.onboarding(),
  });
  const completeMutation = useMutation({
    mutationFn: (id: string) => api.talent.completeOnboardingTask(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["onboarding"] }),
  });

  return (
    <Card>
      <CardContent className="pt-4">
        {(tasks ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No open onboarding tasks.
          </p>
        )}
        <ul className="divide-y">
          {(tasks ?? []).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <span className="font-medium">{t.candidates?.full_name}</span>
                <span className="ml-2">{t.task}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {t.profiles?.full_name && `owner: ${t.profiles.full_name} · `}
                  due {t.due_date}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => completeMutation.mutate(t.id)}
                disabled={completeMutation.isPending}
              >
                Done
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AnalyticsTab() {
  const api = useApi();
  const { data: funnel } = useQuery({
    queryKey: ["recruiting-funnel"],
    queryFn: () => api.talent.funnel(),
  });
  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: () => api.talent.candidates(),
  });

  const offers = (candidates ?? []).filter((c) =>
    ["offer", "hired"].includes(c.stage) || c.stage === "rejected"
  );
  const hired = (candidates ?? []).filter((c) => c.stage === "hired");

  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Candidates</TableHead>
              <TableHead className="text-right">Screened</TableHead>
              <TableHead className="text-right">Interviewed</TableHead>
              <TableHead className="text-right">Offered</TableHead>
              <TableHead className="text-right">Hired</TableHead>
              <TableHead className="text-right">Pooled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(funnel ?? []).map((r) => (
              <TableRow key={r.source}>
                <TableCell className="font-medium">{r.source.replace("_", " ")}</TableCell>
                <TableCell className="text-right tabular-nums">{r.candidates}</TableCell>
                <TableCell className="text-right tabular-nums">{r.screened}</TableCell>
                <TableCell className="text-right tabular-nums">{r.interviewed}</TableCell>
                <TableCell className="text-right tabular-nums">{r.offered}</TableCell>
                <TableCell className="text-right tabular-nums">{r.hired}</TableCell>
                <TableCell className="text-right tabular-nums">{r.pooled}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {hired.length} hired of {offers.length} taken to offer/decision — comparable
          scorecards make these numbers trustworthy.
        </p>
      </CardContent>
    </Card>
  );
}
