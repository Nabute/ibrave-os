import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, TrendingUp } from "lucide-react";
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
import { toDisplayMessage, type Lead, type LeadStage } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { useApi } from "@/lib/session";
import { cn } from "@/lib/utils";
import { LeadDetailDialog } from "./LeadDetailDialog";

const ACTIVE_STAGES: { key: LeadStage; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "negotiation", label: "Negotiation" },
];

export const STAGE_BADGE: Record<LeadStage, "secondary" | "warning" | "success" | "destructive" | "default"> = {
  lead: "secondary",
  qualified: "default",
  proposal_sent: "warning",
  negotiation: "warning",
  won: "success",
  lost: "destructive",
};

export function SalesScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    company: "",
    contact_name: "",
    email: "",
    source: "referral",
    expected_value: "",
    expected_start: "",
  });

  const { data: leads } = useQuery({ queryKey: ["leads"], queryFn: () => api.sales.leads() });
  const { data: report } = useQuery({
    queryKey: ["pipeline-report"],
    queryFn: () => api.sales.pipelineReport(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.sales.createLead({
        company: form.company,
        contact_name: form.contact_name || null,
        email: form.email || null,
        source: form.source,
        expected_value_minor: form.expected_value
          ? Math.round(Number(form.expected_value) * 100)
          : null,
        expected_start: form.expected_start || null,
      }),
    onSuccess: () => {
      setShowNew(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline-report"] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const weighted = (report ?? []).reduce((s, r) => s + (r.weighted_value_minor ?? 0), 0);
  const won = (leads ?? []).filter((l) => l.stage === "won").length;
  const lost = (leads ?? []).filter((l) => l.stage === "lost").length;
  const winRate = won + lost > 0 ? Math.round((100 * won) / (won + lost)) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Sales</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <TrendingUp className="mr-1 inline h-4 w-4 align-text-bottom" />
            Weighted pipeline {formatMinor(weighted, "USD")}
            {winRate != null && ` · win rate ${winRate}%`} · won {won} · lost {lost}
          </p>
        </div>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New lead</DialogTitle>
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
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["referral", "event", "inbound", "research", "outbound", "other"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Expected value (USD)</Label>
                <Input
                  value={form.expected_value}
                  onChange={(e) => setForm({ ...form, expected_value: e.target.value })}
                  placeholder="50000"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Expected start</Label>
                <Input
                  type="date"
                  value={form.expected_start}
                  onChange={(e) => setForm({ ...form, expected_start: e.target.value })}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!form.company || createMutation.isPending}
              >
                Create lead
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="closed">Won / Lost</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ACTIVE_STAGES.map((stage) => {
              const stageLeads = (leads ?? []).filter((l) => l.stage === stage.key);
              const stageValue = stageLeads.reduce(
                (s, l) => s + (l.expected_value_minor ?? 0) * (l.probability_pct / 100),
                0
              );
              return (
                <div key={stage.key} className="space-y-2">
                  <div className="flex items-baseline justify-between px-1">
                    <p className="text-sm font-semibold">{stage.label}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {stageLeads.length} · {formatMinor(Math.round(stageValue), "USD")}
                    </p>
                  </div>
                  <div className="space-y-2 rounded-lg bg-muted/50 p-2 min-h-24">
                    {stageLeads.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => setOpenLead(lead)}
                        className={cn(
                          // Ledger kanban card: 3px left rail carries the
                          // stage's kind color; ≤5 elements, hover floats.
                          "w-full rounded-md border border-l-[3px] bg-card p-3 text-left transition-shadow duration-fast ease-ledger",
                          stage.key === "lead" && "border-l-border",
                          stage.key === "qualified" && "border-l-info",
                          (stage.key === "proposal_sent" || stage.key === "negotiation") &&
                            "border-l-warning",
                          "hover:shadow-float focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
                        )}
                      >
                        <p className="font-medium leading-tight">{lead.company}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {lead.expected_value_minor != null
                            ? formatMinor(lead.expected_value_minor, lead.currency)
                            : "value n/a"}{" "}
                          · {lead.probability_pct}%
                        </p>
                        {lead.expected_start && (
                          <p className="text-xs text-muted-foreground">
                            starts {lead.expected_start}
                          </p>
                        )}
                      </button>
                    ))}
                    {stageLeads.length === 0 && (
                      <p className="px-1 py-3 text-center text-xs text-muted-foreground">empty</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="closed">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Reason / client</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(leads ?? [])
                    .filter((l) => l.stage === "won" || l.stage === "lost")
                    .map((l) => (
                      <TableRow
                        key={l.id}
                        className="cursor-pointer"
                        onClick={() => setOpenLead(l)}
                      >
                        <TableCell className="font-medium">{l.company}</TableCell>
                        <TableCell>
                          <Badge variant={STAGE_BADGE[l.stage]}>{l.stage}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.expected_value_minor != null
                            ? formatMinor(l.expected_value_minor, l.currency)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {l.stage === "lost" ? (l.lost_reason ?? "—") : "handed off to delivery"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts">
          <ContractsTab />
        </TabsContent>
      </Tabs>

      {openLead && (
        <LeadDetailDialog lead={openLead} onClose={() => setOpenLead(null)} />
      )}
    </div>
  );
}

function ContractsTab() {
  const api = useApi();
  const { data: contracts } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => api.sales.contracts(),
  });

  const daysLeft = (end: string | null) =>
    end == null
      ? null
      : Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);

  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Renewal</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(contracts ?? []).map((c) => {
              const left = daysLeft(c.end_date);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.clients?.name}</TableCell>
                  <TableCell>{c.start_date}</TableCell>
                  <TableCell>{c.end_date ?? "open-ended"}</TableCell>
                  <TableCell>
                    {left == null || c.status !== "active" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : left <= 60 ? (
                      <Badge variant={left <= 30 ? "destructive" : "warning"}>
                        {left} days left
                      </Badge>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">{left} days</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.billing_schedule.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.status === "active"
                          ? "success"
                          : c.status === "expired"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          The renewal watchdog notifies sales and the owner 60 and 30 days before an
          active contract ends.
        </p>
      </CardContent>
    </Card>
  );
}
