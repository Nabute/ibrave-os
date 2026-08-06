import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, MessageSquarePlus } from "lucide-react";
import { useState } from "react";

import { WorkspaceActions } from "@/components/WorkspaceActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  actionList,
  toDisplayMessage,
  type Lead,
  type Quote,
  type WorkflowAction,
} from "@/lib/api";
import { formatMinor, parseToMinor } from "@/lib/money";
import { useApi, useSession } from "@/lib/session";
import { STAGE_BADGE } from "./SalesScreen";

/** Lead workspace: activities, versioned quotes, HATEOAS-driven stage actions,
 *  and the Won-deal handoff wizard (A-5). */
export function LeadDetailDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [losing, setLosing] = useState(false);
  const [loseComment, setLoseComment] = useState("");
  const [winning, setWinning] = useState(false);

  const { data: actions } = useQuery({
    queryKey: ["lead-actions", lead.id, lead.stage],
    queryFn: () => api.sales.leadActions(lead.id),
  });
  const { data: activities } = useQuery({
    queryKey: ["lead-activities", lead.id],
    queryFn: () => api.sales.activities(lead.id),
  });
  const { data: quotes } = useQuery({
    queryKey: ["lead-quotes", lead.id],
    queryFn: () => api.sales.quotes(lead.id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["leads"] });
    void qc.invalidateQueries({ queryKey: ["pipeline-report"] });
    void qc.invalidateQueries({ queryKey: ["lead-actions", lead.id] });
    void qc.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
    void qc.invalidateQueries({ queryKey: ["lead-quotes", lead.id] });
  };

  const advanceMutation = useMutation({
    mutationFn: ({ action, comment }: { action: string; comment?: string }) =>
      api.sales.advanceLead(lead.id, action, comment),
    onSuccess: () => {
      setError(null);
      setLosing(false);
      invalidate();
      onClose();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const noteMutation = useMutation({
    mutationFn: () => api.sales.logActivity(lead.id, "note", note, userId!),
    onSuccess: () => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const onAction = (a: WorkflowAction) => {
    if (a.action === "win") {
      setWinning(true);
    } else if (a.requires_comment) {
      setLosing(true);
    } else {
      advanceMutation.mutate({ action: a.action });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Ledger dialog workspace: 880px, header rule, scrolling body, sticky
          action footer (≤1 primary + ghosts, overflow → More). */}
      <DialogContent className="flex max-h-[85vh] w-[880px] max-w-[92vw] flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-3 font-display text-2xl font-normal">
            {lead.company}
            <Badge variant={STAGE_BADGE[lead.stage]}>{lead.stage.replace("_", " ")}</Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {lead.contact_name} · {lead.email} · source: {lead.source} ·{" "}
            {lead.expected_value_minor != null
              ? `${formatMinor(lead.expected_value_minor, lead.currency)} at ${lead.probability_pct}%`
              : "no value set"}
            {lead.expected_start && ` · starts ${lead.expected_start}`}
          </p>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <QuotesSection lead={lead} quotes={quotes ?? []} onChanged={invalidate} onError={setError} />

        <Separator />

        <div>
          <p className="mb-2 text-sm font-semibold">Activity</p>
          <div className="mb-3 flex gap-2">
            <Input
              placeholder="Log a note, call, or meeting…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && note.trim() && noteMutation.mutate()}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => noteMutation.mutate()}
              disabled={!note.trim() || noteMutation.isPending}
              aria-label="Add note"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {(activities ?? []).map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(a.at).toLocaleDateString()}
                </span>
                <span>
                  <Badge variant="outline" className="mr-1.5 align-middle">
                    {a.kind.replace("_", " ")}
                  </Badge>
                  {a.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
        </div>

        <WorkspaceActions
          actions={actionList(actions)}
          onAction={onAction}
          primaryAction="win"
          busy={advanceMutation.isPending}
        />

        {/* Lose dialog */}
        <Dialog open={losing} onOpenChange={setLosing}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark lost</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="Why was the deal lost? (required)"
              value={loseComment}
              onChange={(e) => setLoseComment(e.target.value)}
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={loseComment.trim() === "" || advanceMutation.isPending}
                onClick={() => advanceMutation.mutate({ action: "lose", comment: loseComment })}
              >
                Mark lost
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {winning && (
          <WinWizard lead={lead} onClose={() => setWinning(false)} onDone={() => { invalidate(); onClose(); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuotesSection({
  lead,
  quotes,
  onChanged,
  onError,
}: {
  lead: Lead;
  quotes: Quote[];
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const api = useApi();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [line, setLine] = useState({ description: "", role_title: "", qty_hours: "", rate: "" });

  const createQuote = useMutation({
    mutationFn: () => api.sales.createQuote(lead.id),
    onSuccess: onChanged,
    onError: (e) => onError(toDisplayMessage(e)),
  });
  const quoteAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      action === "revise"
        ? api.sales.createRevision(id)
        : api.sales.quoteAction(id, action, action === "reject" ? "Client declined" : undefined),
    onSuccess: onChanged,
    onError: (e) => onError(toDisplayMessage(e)),
  });
  const addLine = useMutation({
    mutationFn: (quoteId: string) => {
      const rateMinor = parseToMinor(line.rate);
      if (rateMinor == null) throw new Error("Enter a valid hourly rate");
      const qty = line.qty_hours ? Number(line.qty_hours) : 1;
      return api.sales.addQuoteLine({
        quote_id: quoteId,
        description: line.description,
        role_title: line.role_title || null,
        qty_hours: line.qty_hours ? qty : null,
        unit_price_minor: rateMinor,
        amount_minor: Math.round(qty * rateMinor),
        position: 99,
      });
    },
    onSuccess: () => {
      setAddingTo(null);
      setLine({ description: "", role_title: "", qty_hours: "", rate: "" });
      onChanged();
    },
    onError: (e) => onError(toDisplayMessage(e)),
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Quotes</p>
        {["lead", "qualified", "proposal_sent", "negotiation"].includes(lead.stage) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => createQuote.mutate()}
            disabled={createQuote.isPending}
          >
            <FileText className="h-4 w-4" /> New version
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {quotes.map((q) => (
          <div key={q.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                v{q.version}
                <Badge
                  className="ml-2 align-middle"
                  variant={
                    q.status === "accepted"
                      ? "success"
                      : q.status === "sent"
                        ? "warning"
                        : q.status === "rejected"
                          ? "destructive"
                          : "secondary"
                  }
                >
                  {q.status}
                </Badge>
                <span className="ml-2 tabular-nums text-muted-foreground">
                  {formatMinor(q.total_minor, q.currency)}
                </span>
              </div>
              <div className="flex gap-1.5">
                {q.status === "draft" && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setAddingTo(q.id)}>
                      + Line
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => quoteAction.mutate({ id: q.id, action: "send" })}
                    >
                      Mark sent
                    </Button>
                  </>
                )}
                {q.status === "sent" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => quoteAction.mutate({ id: q.id, action: "accept" })}
                    >
                      Accepted
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => quoteAction.mutate({ id: q.id, action: "revise" })}
                    >
                      Revise
                    </Button>
                  </>
                )}
              </div>
            </div>
            {(q.quote_lines ?? []).length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {(q.quote_lines ?? [])
                  .sort((a, b) => a.position - b.position)
                  .map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span>{l.description}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatMinor(l.amount_minor, q.currency)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            {addingTo === q.id && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-2">
                <Input
                  className="col-span-2"
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => setLine({ ...line, description: e.target.value })}
                />
                <Input
                  placeholder="Role (optional)"
                  value={line.role_title}
                  onChange={(e) => setLine({ ...line, role_title: e.target.value })}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Hours"
                    value={line.qty_hours}
                    onChange={(e) => setLine({ ...line, qty_hours: e.target.value })}
                  />
                  <Input
                    placeholder="Rate"
                    value={line.rate}
                    onChange={(e) => setLine({ ...line, rate: e.target.value })}
                  />
                </div>
                <Button
                  className="col-span-2"
                  size="sm"
                  disabled={!line.description || !line.rate || addLine.isPending}
                  onClick={() => addLine.mutate(q.id)}
                >
                  Add line
                </Button>
              </div>
            )}
          </div>
        ))}
        {quotes.length === 0 && (
          <p className="text-sm text-muted-foreground">No quotes yet.</p>
        )}
      </div>
    </div>
  );
}

/** The A-5 handoff: Won → client + contract + project + staffing request. */
function WinWizard({
  lead,
  onClose,
  onDone,
}: {
  lead: Lead;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.clients.list(),
  });
  const [form, setForm] = useState({
    client_id: "",
    project_name: `${lead.company} Engagement`,
    billing_model: "tm",
    contract_end_date: "",
    withStaffing: true,
    role_title: "Developer",
    allocation_pct: "100",
    duration_weeks: "12",
  });

  const winMutation = useMutation({
    mutationFn: () =>
      api.sales.winLead(lead.id, {
        client_id: form.client_id || null,
        project_name: form.project_name,
        billing_model: form.billing_model,
        contract_end_date: form.contract_end_date || null,
        staffing: form.withStaffing
          ? {
              role_title: form.role_title,
              allocation_pct: Number(form.allocation_pct),
              skills: [],
              duration_weeks: form.duration_weeks ? Number(form.duration_weeks) : null,
            }
          : null,
      }),
    onSuccess: () => {
      ["clients", "projects", "contracts", "staffing-requests"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })
      );
      onDone();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Win handoff — {lead.company}</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">
          One step creates the client, the contract (from the accepted quote when there is
          one), the project, and a staffing request — no retyping.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Client</Label>
            <Select
              value={form.client_id || "new"}
              onValueChange={(v) => setForm({ ...form, client_id: v === "new" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Create “{lead.company}” as a new client</SelectItem>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Existing: {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Project name</Label>
            <Input
              value={form.project_name}
              onChange={(e) => setForm({ ...form, project_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Billing model</Label>
            <Select
              value={form.billing_model}
              onValueChange={(v) => setForm({ ...form, billing_model: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tm">Time & Materials</SelectItem>
                <SelectItem value="retainer">Retainer</SelectItem>
                <SelectItem value="fixed">Fixed price</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Contract end date (optional)</Label>
            <Input
              type="date"
              value={form.contract_end_date}
              onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })}
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              id="with-staffing"
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.withStaffing}
              onChange={(e) => setForm({ ...form, withStaffing: e.target.checked })}
            />
            <Label htmlFor="with-staffing">Open a staffing request for the roles sold</Label>
          </div>
          {form.withStaffing && (
            <>
              <div className="space-y-1">
                <Label>Role title</Label>
                <Input
                  value={form.role_title}
                  onChange={(e) => setForm({ ...form, role_title: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <div className="space-y-1">
                  <Label>Alloc %</Label>
                  <Input
                    value={form.allocation_pct}
                    onChange={(e) => setForm({ ...form, allocation_pct: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Weeks</Label>
                  <Input
                    value={form.duration_weeks}
                    onChange={(e) => setForm({ ...form, duration_weeks: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => winMutation.mutate()}
            disabled={!form.project_name || winMutation.isPending}
          >
            {winMutation.isPending ? "Creating…" : "Mark won & hand off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
