import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUrlTab } from "@/lib/useUrlTab";
import { DetailSkeleton } from "@/components/Skeletons";
import { Link, useParams } from "@tanstack/react-router";
import { AlertTriangle, ClipboardCheck, FileText, MessageSquarePlus, Star, UserRoundPlus } from "lucide-react";
import { useState } from "react";

import { EmailComposer } from "@/components/EmailComposer";
import { KpiTile } from "@/components/KpiTile";
import { LocalClock } from "@/components/LocalClock";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toDisplayMessage, type HealthLight } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { useApi, useSession } from "@/lib/session";
import { INVOICE_BADGE } from "@/features/invoicing/status";

export const HEALTH_BADGE: Record<HealthLight, "success" | "warning" | "destructive"> = {
  green: "success",
  yellow: "warning",
  red: "destructive",
};

/** Account 360 (G-1): everything about the client, entered nowhere twice. */
export function ClientDetailScreen() {
  const [tab, setTab] = useUrlTab("timeline");
  const { clientId } = useParams({ strict: false }) as { clientId: string };
  const api = useApi();

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.clients.get(clientId),
  });
  const { data: acc } = useQuery({
    queryKey: ["account-360", clientId],
    queryFn: () => api.accounts.account360(clientId),
  });
  const { data: contacts } = useQuery({
    queryKey: ["client-contacts", clientId],
    queryFn: () => api.clients.contacts(clientId),
  });
  const { data: projects } = useQuery({
    queryKey: ["client-projects", clientId],
    queryFn: () => api.clients.projects(clientId),
  });
  const { data: invoices } = useQuery({
    queryKey: ["client-invoices", clientId],
    queryFn: () => api.clients.invoices(clientId),
  });

  if (!client) return <DetailSkeleton />;

  const health = acc?.health;
  const renewalDays = acc?.next_renewal
    ? Math.ceil((new Date(acc.next_renewal).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3">
            {client.name}
            <Badge variant="outline" className="uppercase">tier {client.tier}</Badge>
            {health && (
              <Badge variant={HEALTH_BADGE[health.light]}>
                {health.light} · {health.score}
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {client.legal_name ?? ""} · {client.currency} · Net {client.payment_terms_days} ·
            grouped by {client.invoice_grouping}
          </p>
        </div>
        {client.timezone && (
          <div className="text-right">
            <p className="label-caps text-[10px] text-muted-foreground">Local time</p>
            <LocalClock timezone={client.timezone} className="text-lg" />
          </div>
        )}
      </div>

      {health && health.factors.length > 0 && (
        <Card className="border-warning-foreground/30">
          <CardContent className="pt-4">
            <p className="mb-1 text-sm font-semibold">
              <AlertTriangle className="mr-1 inline h-4 w-4 align-text-bottom" />
              Health factors (explainable, every penalty named)
            </p>
            <ul className="space-y-0.5 text-sm text-muted-foreground">
              {health.factors.map((f) => (
                <li key={f.factor}>
                  −{f.penalty} · {f.detail}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Live stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Hours this month" value={`${acc?.hours_this_month ?? 0}h`} />
        <KpiTile
          label="Open AR"
          value={formatMinor(acc?.open_ar_minor ?? 0, client.currency)}
          kind={(acc?.overdue_ar_minor ?? 0) > 0 ? "critical" : "default"}
          sub={
            (acc?.overdue_ar_minor ?? 0) > 0
              ? `${formatMinor(acc!.overdue_ar_minor, client.currency)} overdue`
              : undefined
          }
        />
        <KpiTile
          label="Next renewal"
          value={renewalDays != null ? `${renewalDays}d` : "-"}
          kind={renewalDays != null && renewalDays <= 60 ? "attention" : "default"}
          sub={acc?.next_renewal ?? undefined}
        />
        <KpiTile
          label="Open opportunities"
          value={formatMinor(acc?.open_opportunities_minor ?? 0, client.currency)}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="escalations">
            Escalations
            {(acc?.open_escalations ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[11px] text-destructive-foreground">
                {acc?.open_escalations}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="portal">Client portal</TabsTrigger>
          <TabsTrigger value="records">Contacts & records</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <TimelineTab clientId={clientId} />
        </TabsContent>
        <TabsContent value="opportunities">
          <OpportunitiesTab clientId={clientId} currency={client.currency} />
        </TabsContent>
        <TabsContent value="escalations">
          <EscalationsTab clientId={clientId} />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackTab clientId={clientId} projects={projects ?? []} />
        </TabsContent>
        <TabsContent value="portal">
          <PortalTab clientId={clientId} projects={projects ?? []} invoices={invoices ?? []} />
        </TabsContent>

        <TabsContent value="records">
          <div className="grid gap-4 lg:grid-cols-2">
            <BillingDetailsCard clientId={clientId} />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Contacts</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(contacts ?? []).map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span>
                        {c.name}
                        <span className="ml-2 text-muted-foreground">{c.email}</span>
                      </span>
                      <Badge variant="secondary">{c.contact_role}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Projects & team</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2">
                  {(projects ?? []).map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-sm">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: p.id }}
                        className="text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {p.billing_model.toUpperCase()} · {p.status}
                      </span>
                    </li>
                  ))}
                </ul>
                {(acc?.team ?? []).length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Team:{" "}
                    {(acc?.team ?? [])
                      .map((t) => `${t.full_name}${t.role ? ` (${t.role})` : ""}`)
                      .join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Invoice history</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoices ?? []).map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link
                            to="/invoices/$invoiceId"
                            params={{ invoiceId: inv.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {inv.number ?? "(draft)"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={INVOICE_BADGE[inv.status]}>{inv.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMinor(inv.total_minor, inv.currency)}
                        </TableCell>
                        <TableCell>{inv.due_date ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PortalTab({
  clientId,
  projects,
  invoices,
}: {
  clientId: string;
  projects: { id: string; name: string }[];
  invoices: { id: string; number: string | null; total_minor: number; currency: string }[];
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [portalUser, setPortalUser] = useState({ email: "", full_name: "" });
  const [documentForm, setDocumentForm] = useState({
    title: "",
    storage_path: "",
    project_id: "none",
    visibility: "client" as "internal" | "client",
  });
  const [approvalForm, setApprovalForm] = useState({
    title: "",
    body: "",
    project_id: "none",
    invoice_id: "none",
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["client-portal-users", clientId] });
    void qc.invalidateQueries({ queryKey: ["client-documents", clientId] });
    void qc.invalidateQueries({ queryKey: ["client-approval-requests", clientId] });
  };

  const { data: portalUsers } = useQuery({
    queryKey: ["client-portal-users", clientId],
    queryFn: () => api.productization.clientPortalUsers(clientId),
  });
  const { data: documents } = useQuery({
    queryKey: ["client-documents", clientId],
    queryFn: () => api.productization.clientDocuments(clientId),
  });
  const { data: approvals } = useQuery({
    queryKey: ["client-approval-requests", clientId],
    queryFn: () => api.productization.clientApprovalRequests(clientId),
  });

  const portalUserMutation = useMutation({
    mutationFn: () =>
      api.productization.createClientPortalUser({
        client_id: clientId,
        email: portalUser.email.trim(),
        full_name: portalUser.full_name.trim() || null,
        status: "invited",
        invited_by: userId,
      }),
    onSuccess: () => {
      setPortalUser({ email: "", full_name: "" });
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const documentMutation = useMutation({
    mutationFn: () =>
      api.productization.createClientDocument({
        client_id: clientId,
        title: documentForm.title.trim(),
        storage_path: documentForm.storage_path.trim(),
        project_id: documentForm.project_id === "none" ? null : documentForm.project_id,
        visibility: documentForm.visibility,
        uploaded_by: userId,
      }),
    onSuccess: () => {
      setDocumentForm({ title: "", storage_path: "", project_id: "none", visibility: "client" });
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const approvalMutation = useMutation({
    mutationFn: () =>
      api.productization.createClientApprovalRequest({
        client_id: clientId,
        title: approvalForm.title.trim(),
        body: approvalForm.body.trim() || null,
        project_id: approvalForm.project_id === "none" ? null : approvalForm.project_id,
        invoice_id: approvalForm.invoice_id === "none" ? null : approvalForm.invoice_id,
        requested_by: userId,
      }),
    onSuccess: () => {
      setApprovalForm({ title: "", body: "", project_id: "none", invoice_id: "none" });
      setError(null);
      invalidate();
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
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>External access</CardDescription>
            <CardTitle className="text-lg">Portal users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  value={portalUser.email}
                  onChange={(e) => setPortalUser({ ...portalUser, email: e.target.value })}
                  placeholder="client@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={portalUser.full_name}
                  onChange={(e) => setPortalUser({ ...portalUser, full_name: e.target.value })}
                  placeholder="Avery Client"
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={portalUserMutation.isPending || !portalUser.email.trim()}
              onClick={() => portalUserMutation.mutate()}
            >
              <UserRoundPlus className="h-4 w-4" /> Invite
            </Button>
            <ul className="space-y-2 text-sm">
              {(portalUsers ?? []).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3">
                  <span>
                    {u.full_name ?? u.email}
                    {u.full_name && <span className="ml-2 text-muted-foreground">{u.email}</span>}
                  </span>
                  <Badge variant={u.status === "active" ? "success" : "secondary"}>{u.status}</Badge>
                </li>
              ))}
              {(portalUsers ?? []).length === 0 && (
                <p className="text-muted-foreground">No portal users registered.</p>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Shared files</CardDescription>
            <CardTitle className="text-lg">Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  value={documentForm.title}
                  onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}
                  placeholder="Statement of work"
                />
              </div>
              <div className="space-y-1">
                <Label>Path or URL</Label>
                <Input
                  value={documentForm.storage_path}
                  onChange={(e) =>
                    setDocumentForm({ ...documentForm, storage_path: e.target.value })
                  }
                  placeholder="clients/acme/sow.pdf"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Project</Label>
                  <Select
                    value={documentForm.project_id}
                    onValueChange={(v) => setDocumentForm({ ...documentForm, project_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Visibility</Label>
                  <Select
                    value={documentForm.visibility}
                    onValueChange={(v) =>
                      setDocumentForm({ ...documentForm, visibility: v as "internal" | "client" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">client</SelectItem>
                      <SelectItem value="internal">internal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              disabled={
                documentMutation.isPending ||
                !documentForm.title.trim() ||
                !documentForm.storage_path.trim()
              }
              onClick={() => documentMutation.mutate()}
            >
              <FileText className="h-4 w-4" /> Add document
            </Button>
            <ul className="space-y-2 text-sm">
              {(documents ?? []).slice(0, 8).map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{doc.title}</span>
                  <Badge variant={doc.visibility === "client" ? "success" : "outline"}>
                    {doc.visibility}
                  </Badge>
                </li>
              ))}
              {(documents ?? []).length === 0 && (
                <p className="text-muted-foreground">No documents registered.</p>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Client decisions</CardDescription>
            <CardTitle className="text-lg">Approval requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  value={approvalForm.title}
                  onChange={(e) => setApprovalForm({ ...approvalForm, title: e.target.value })}
                  placeholder="Approve July timesheets"
                />
              </div>
              <div className="space-y-1">
                <Label>Details</Label>
                <Textarea
                  value={approvalForm.body}
                  onChange={(e) => setApprovalForm({ ...approvalForm, body: e.target.value })}
                  placeholder="Summary, deadline, or special instructions"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Project</Label>
                  <Select
                    value={approvalForm.project_id}
                    onValueChange={(v) => setApprovalForm({ ...approvalForm, project_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Invoice</Label>
                  <Select
                    value={approvalForm.invoice_id}
                    onValueChange={(v) => setApprovalForm({ ...approvalForm, invoice_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No invoice</SelectItem>
                      {invoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.number ?? "draft invoice"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              disabled={approvalMutation.isPending || !approvalForm.title.trim()}
              onClick={() => approvalMutation.mutate()}
            >
              <ClipboardCheck className="h-4 w-4" /> Request
            </Button>
            <ul className="space-y-2 text-sm">
              {(approvals ?? []).slice(0, 8).map((approval) => (
                <li key={approval.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{approval.title}</span>
                  <Badge
                    variant={
                      approval.status === "approved"
                        ? "success"
                        : approval.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {approval.status}
                  </Badge>
                </li>
              ))}
              {(approvals ?? []).length === 0 && (
                <p className="text-muted-foreground">No approval requests created.</p>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Everything the invoice template needs from the client, editable by finance. */
function BillingDetailsCard({ clientId }: { clientId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { hasRole } = useSession();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.clients.get(clientId),
  });

  const saveMutation = useMutation({
    // Blank timezone must reach the DB as null, not "" (the zone is validated).
    mutationFn: () =>
      api.clients.update(clientId, {
        ...form,
        ...(form && "timezone" in form ? { timezone: form.timezone?.trim() || null } : {}),
      } as never),
    onSuccess: () => {
      setForm(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  if (!client || !hasRole("finance")) return null;

  const fields = [
    ["legal_name", "Legal name"],
    ["billing_address", "Billing address"],
    ["code", "Invoice code (e.g. HWAC)"],
    ["org_no", "Org. No."],
    ["vat_no", "VAT No."],
    ["timezone", "Timezone (e.g. Europe/Berlin)"],
  ] as const;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Billing details</CardTitle>
        <CardDescription>
          Printed on invoices; the code becomes part of the invoice number
          ({`INV-${(form?.code ?? client.code ?? "CODE").toUpperCase()}-YYYY-NNNN`}).
          The timezone drives the local-time display on client screens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Input
                value={form?.[key] ?? String(client[key] ?? "")}
                onChange={(e) => setForm({ ...(form ?? {}), [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <Button
          size="sm"
          disabled={!form || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          Save billing details
        </Button>
      </CardContent>
    </Card>
  );
}

function TimelineTab({ clientId }: { clientId: string }) {
  const api = useApi();
  const { data: clientRow } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.clients.get(clientId),
  });
  const clientName = clientRow?.name ?? "";
  const qc = useQueryClient();
  const { userId } = useSession();
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("note");
  const [emailing, setEmailing] = useState(false);
  const [digesting, setDigesting] = useState(false);

  // C-3: last month's hours summary, auto-drafted for review-and-send.
  const prev = new Date();
  prev.setDate(1);
  prev.setMonth(prev.getMonth() - 1);
  const digestMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
  const digestQuery = useQuery({
    queryKey: ["digest", clientId, digestMonth],
    queryFn: () => api.accounts.digest(clientId, digestMonth),
    enabled: digesting,
  });

  const { data: activities } = useQuery({
    queryKey: ["account-activities", clientId],
    queryFn: () => api.accounts.activities(clientId),
  });
  const { data: contacts } = useQuery({
    queryKey: ["client-contacts", clientId],
    queryFn: () => api.clients.contacts(clientId),
  });

  const logMutation = useMutation({
    mutationFn: () => api.accounts.logActivity(clientId, kind, note, userId!),
    onSuccess: () => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["account-activities", clientId] });
      void qc.invalidateQueries({ queryKey: ["account-360", clientId] });
    },
  });

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-4 flex gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["note", "call", "meeting", "email"].map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Log what happened…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && note.trim() && logMutation.mutate()}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Log activity"
            disabled={!note.trim() || logMutation.isPending}
            onClick={() => logMutation.mutate()}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setEmailing(true)}>
            Email client
          </Button>
          <Button
            variant="outline"
            disabled={digestQuery.isFetching}
            onClick={() => setDigesting(true)}
          >
            Draft digest
          </Button>
        </div>
        <EmailComposer
          open={emailing}
          onClose={() => setEmailing(false)}
          to={(contacts ?? [])
            .filter((c) => c.email && !c.opted_out)
            .map((c) => c.email!)}
          templateVars={{
            client_name: clientName,
            contact_name:
              (contacts ?? []).find((c) => c.email && !c.opted_out)?.name ?? clientName,
            company: clientName,
          }}
          related={{ client_id: clientId }}
          onSent={() => {
            void qc.invalidateQueries({ queryKey: ["account-activities", clientId] });
          }}
        />
        {digesting && digestQuery.data && (
          <EmailComposer
            open
            onClose={() => setDigesting(false)}
            to={(contacts ?? [])
              .filter((c) => c.email && !c.opted_out)
              .map((c) => c.email!)}
            subject={`Delivery summary · ${digestQuery.data.month}`}
            body={`Hello,\n\nHere is the delivery summary for ${digestQuery.data.month}:\n\n${digestQuery.data.rows
              .map((r) => `• ${r.project} · ${r.person} (${r.task}): ${r.hours} h`)
              .join("\n")}\n\nTotal approved hours: ${digestQuery.data.total_hours} h\n\nAll hours are backed by approved timesheets, happy to share the detail.\n\nBest regards,`}
            related={{ client_id: clientId }}
            onSent={() => {
              setDigesting(false);
              void qc.invalidateQueries({ queryKey: ["account-activities", clientId] });
            }}
          />
        )}
        <ul className="space-y-2.5 text-sm">
          {(activities ?? []).map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                {new Date(a.at).toLocaleDateString()}
              </span>
              <span>
                <Badge
                  variant={a.source === "system" ? "secondary" : "outline"}
                  className="mr-1.5 align-middle"
                >
                  {a.kind}
                </Badge>
                {a.body}
              </span>
            </li>
          ))}
          {(activities ?? []).length === 0 && (
            <p className="text-muted-foreground">
              No activity yet, log the first call or meeting.
            </p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function OpportunitiesTab({ clientId, currency }: { clientId: string; currency: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: "", value: "", expected_start: "" });

  const { data: opportunities } = useQuery({
    queryKey: ["opportunities", clientId],
    queryFn: () => api.accounts.opportunities(clientId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["opportunities", clientId] });
    void qc.invalidateQueries({ queryKey: ["account-360", clientId] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      api.accounts.createOpportunity({
        client_id: clientId,
        description: form.description,
        value_minor: form.value ? Math.round(Number(form.value) * 100) : null,
        expected_start: form.expected_start || null,
        owner_id: userId,
      }),
    onSuccess: () => {
      setOpen(false);
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.accounts.updateOpportunity(id, { stage: stage as never }),
    onSuccess: invalidate,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>New opportunity</Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Expected start</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(opportunities ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.description}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.value_minor != null ? formatMinor(o.value_minor, currency) : "-"}
                  </TableCell>
                  <TableCell>{o.expected_start ?? "-"}</TableCell>
                  <TableCell>
                    <Select
                      value={o.stage}
                      onValueChange={(v) => stageMutation.mutate({ id: o.id, stage: v })}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["idea", "proposed", "won", "lost"].map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(opportunities ?? []).length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No growth opportunities recorded.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New opportunity</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Add 2 QA engineers in Q4"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Value ({currency})</Label>
                <Input
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder="48000"
                />
              </div>
              <div className="space-y-1">
                <Label>Expected start</Label>
                <Input
                  type="date"
                  value={form.expected_start}
                  onChange={(e) => setForm({ ...form, expected_start: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!form.description || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EscalationsTab({ clientId }: { clientId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [form, setForm] = useState({ severity: "medium", summary: "" });
  const [resolution, setResolution] = useState("");

  const { data: escalations } = useQuery({
    queryKey: ["escalations", clientId],
    queryFn: () => api.accounts.escalations(clientId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["escalations", clientId] });
    void qc.invalidateQueries({ queryKey: ["account-360", clientId] });
  };

  const openMutation = useMutation({
    mutationFn: () =>
      api.accounts.openEscalation(clientId, form.severity, form.summary, userId!),
    onSuccess: () => {
      setOpen(false);
      setForm({ severity: "medium", summary: "" });
      invalidate();
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.accounts.resolveEscalation(id, resolution),
    onSuccess: () => {
      setResolving(null);
      setResolution("");
      invalidate();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm leading-relaxed text-muted-foreground">
          An open escalation pauses dunning escalation beyond the courtesy reminder -
          collections pressure never lands mid-firefight.
        </p>
        <Button onClick={() => setOpen(true)}>Open escalation</Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <ul className="space-y-3">
            {(escalations ?? []).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <Badge
                    variant={
                      e.resolved_at
                        ? "secondary"
                        : e.severity === "high"
                          ? "destructive"
                          : "warning"
                    }
                    className="mr-2 align-middle"
                  >
                    {e.resolved_at ? "resolved" : e.severity}
                  </Badge>
                  {e.summary}
                  {e.resolution && (
                    <p className="mt-0.5 text-muted-foreground">→ {e.resolution}</p>
                  )}
                </div>
                {!e.resolved_at && (
                  <Button variant="outline" size="sm" onClick={() => setResolving(e.id)}>
                    Resolve
                  </Button>
                )}
              </li>
            ))}
            {(escalations ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No escalations. 🎉</p>
            )}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open escalation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={form.severity}
              onValueChange={(v) => setForm({ ...form, severity: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["low", "medium", "high"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="What's on fire?"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!form.summary.trim() || openMutation.isPending}
              onClick={() => openMutation.mutate()}
            >
              Open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve escalation</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="How was it resolved?"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          <DialogFooter>
            <Button
              disabled={!resolution.trim() || resolveMutation.isPending}
              onClick={() => resolving && resolveMutation.mutate(resolving)}
            >
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeedbackTab({
  clientId,
  projects,
}: {
  clientId: string;
  projects: { id: string; name: string }[];
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [form, setForm] = useState({ project_id: "", score: 0, comment: "" });

  const { data: pulses } = useQuery({
    queryKey: ["feedback", clientId],
    queryFn: () => api.accounts.feedback(clientId),
  });

  const recordMutation = useMutation({
    mutationFn: () =>
      api.accounts.recordFeedback({
        client_id: clientId,
        project_id: form.project_id || null,
        score_1_5: form.score,
        comment: form.comment || undefined,
        actor_id: userId!,
      }),
    onSuccess: () => {
      setForm({ project_id: "", score: 0, comment: "" });
      void qc.invalidateQueries({ queryKey: ["feedback", clientId] });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Record a pulse</CardTitle>
          <CardDescription>
            A 1–5 after each check-in, feeds the health score.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={form.project_id}
            onValueChange={(v) => setForm({ ...form, project_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Project (optional)" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1" role="radiogroup" aria-label="Score">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={form.score === n}
                aria-label={`${n} of 5`}
                onClick={() => setForm({ ...form, score: n })}
                className="rounded p-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star
                  className={
                    n <= form.score
                      ? "h-6 w-6 fill-warning-foreground text-warning-foreground"
                      : "h-6 w-6 text-muted-foreground"
                  }
                />
              </button>
            ))}
          </div>
          <Input
            placeholder="Comment (optional)"
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
          <Button
            disabled={form.score === 0 || recordMutation.isPending}
            onClick={() => recordMutation.mutate()}
          >
            Record
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(pulses ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>
                  {"★".repeat(p.score_1_5)}
                  <span className="text-muted-foreground">
                    {"★".repeat(5 - p.score_1_5)}
                  </span>
                  {p.projects?.name && (
                    <span className="ml-2 text-muted-foreground">{p.projects.name}</span>
                  )}
                  {p.comment && <span className="ml-2">- {p.comment}</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(p.at).toLocaleDateString()}
                </span>
              </li>
            ))}
            {(pulses ?? []).length === 0 && (
              <p className="text-muted-foreground">No pulses recorded.</p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
