import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailSkeleton } from "@/components/Skeletons";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Mail, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";

import { EmailComposer } from "@/components/EmailComposer";
import { KpiTile } from "@/components/KpiTile";
import { InvoiceDocument } from "./InvoiceDocument";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  actionList,
  toDisplayMessage,
  type WorkflowAction,
} from "@/lib/api";
import { formatMinor, parseToMinor } from "@/lib/money";
import { useApi } from "@/lib/session";
import { INVOICE_BADGE } from "./status";

/**
 * Invoice workspace. Action buttons are rendered from the server's HATEOAS
 * map (invoice_actions RPC) — hidden means absent, not disabled; the server
 * re-validates every action on execution.
 */
export function InvoiceDetailScreen() {
  const { invoiceId } = useParams({ strict: false }) as { invoiceId: string };
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<WorkflowAction | null>(null);
  const [comment, setComment] = useState("");
  const [payment, setPayment] = useState({ amount: "", method: "bank transfer" });
  const [credit, setCredit] = useState({ amount: "", description: "" });
  const [manualLine, setManualLine] = useState({ description: "", amount: "" });
  const [showManualLine, setShowManualLine] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const { data: invoice } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api.invoices.get(invoiceId),
  });
  const { data: actions } = useQuery({
    queryKey: ["invoice-actions", invoiceId, invoice?.status],
    queryFn: () => api.invoices.actions(invoiceId),
    enabled: !!invoice,
  });
  const { data: history } = useQuery({
    queryKey: ["invoice-history", invoiceId, invoice?.status],
    queryFn: () => api.invoices.history(invoiceId),
    enabled: !!invoice,
  });
  const { data: settings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => api.admin.settings(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    void qc.invalidateQueries({ queryKey: ["invoice-actions", invoiceId] });
    void qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const runAction = useMutation({
    mutationFn: async (action: WorkflowAction) => {
      switch (action.action) {
        case "issue":
          return api.invoices.issue(invoiceId);
        case "void":
          return api.invoices.voidInvoice(invoiceId, comment);
        case "delete_draft":
          await api.invoices.deleteDraft(invoiceId);
          return null;
        case "record_payment": {
          const minor = parseToMinor(payment.amount);
          if (minor == null) throw new Error("Enter a valid amount");
          return api.invoices.recordPayment(
            invoiceId,
            minor,
            new Date().toISOString().slice(0, 10),
            payment.method
          );
        }
        case "credit_note": {
          const minor = parseToMinor(credit.amount);
          if (minor == null) throw new Error("Enter a valid amount");
          return api.invoices.createCreditNote(invoiceId, minor, credit.description);
        }
        default:
          throw new Error(`Unknown action ${action.action}`);
      }
    },
    onSuccess: (_result, action) => {
      setError(null);
      setPendingAction(null);
      setComment("");
      if (action.action === "delete_draft") {
        void navigate({ to: "/invoices" });
        return;
      }
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const addLineMutation = useMutation({
    mutationFn: () => {
      const minor = parseToMinor(manualLine.amount);
      if (minor == null) throw new Error("Enter a valid amount (negative = discount)");
      return api.invoices.addManualLine({
        invoice_id: invoiceId,
        description: manualLine.description,
        quantity: 1,
        unit_price_minor: minor,
        amount_minor: minor,
        tax_rate_pct: 0,
        position: (invoice?.invoice_lines?.length ?? 0) + 1,
      });
    },
    onSuccess: () => {
      setShowManualLine(false);
      setManualLine({ description: "", amount: "" });
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) => api.invoices.deleteLine(lineId),
    onSuccess: invalidate,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  if (!invoice) return <DetailSkeleton />;

  const isDraft = invoice.status === "draft";
  const needsDialog = (a: WorkflowAction) =>
    a.requires_comment || ["record_payment", "credit_note"].includes(a.action);
  const paidTotal = (invoice.payments ?? []).reduce((s, p) => s + p.amount_minor, 0);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>
            {invoice.number ?? "Draft invoice"}{" "}
            <Badge variant={INVOICE_BADGE[invoice.status]} className="align-middle">
              {invoice.status}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {invoice.clients?.name} · {invoice.period_start} → {invoice.period_end}
            {invoice.due_date && ` · due ${invoice.due_date}`}
          </p>
        </div>
        <div className="flex gap-2">
          {actionList(actions).map((a) => (
            <Button
              key={a.action}
              variant={a.destructive ? "destructive" : a.action === "issue" ? "default" : "outline"}
              onClick={() =>
                needsDialog(a) ? setPendingAction(a) : runAction.mutate(a)
              }
              disabled={runAction.isPending}
            >
              {a.label}
            </Button>
          ))}
          {invoice.status !== "draft" && (
            <>
              <Button variant="outline" onClick={() => setEmailing(true)}>
                <Mail className="h-4 w-4" /> Email to client
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print / PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="no-print rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Wide screens: document at paper width + a live rail beside it. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,920px)_minmax(320px,1fr)] xl:items-start">
        <div className="space-y-2">
          <InvoiceDocument
            invoice={invoice}
            settings={settings}
            isDraft={isDraft}
            onDeleteLine={(lineId) => deleteLineMutation.mutate(lineId)}
          />
          {isDraft && (
            <div className="no-print">
              <Button variant="ghost" size="sm" onClick={() => setShowManualLine(true)}>
                <Plus className="h-4 w-4" /> Manual line (discount, fee, credit)
              </Button>
            </div>
          )}
        </div>

        <div className="no-print space-y-4">
          {paidTotal > 0 && (
            <KpiTile
              label="Paid so far"
              value={formatMinor(paidTotal, invoice.currency)}
              sub={`of ${formatMinor(invoice.total_minor, invoice.currency)}`}
              kind={paidTotal >= invoice.total_minor ? "positive" : "default"}
              meterPct={
                invoice.total_minor > 0
                  ? Math.round((100 * paidTotal) / invoice.total_minor)
                  : undefined
              }
            />
          )}

      {(invoice.payments ?? []).length > 0 && (
        <Card className="no-print">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {(invoice.payments ?? []).map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>
                    {p.paid_at} · {p.method ?? "—"} {p.note && `· ${p.note}`}
                  </span>
                  <span className="tabular-nums">
                    {formatMinor(p.amount_minor, invoice.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(history ?? []).length > 0 && (
        <Card className="no-print">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Workflow history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {(history ?? []).map((h) => (
                <li key={h.id}>
                  {new Date(h.at).toLocaleString()} — <strong>{h.action}</strong>:{" "}
                  {h.from_state} → {h.to_state}
                  {h.comment && ` (“${h.comment}”)`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
        </div>
      </div>

      {/* Action dialog: comment / payment / credit-note input */}
      <Dialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction?.label}</DialogTitle>
          </DialogHeader>
          {pendingAction?.requires_comment && (
            <div className="space-y-1">
              <Label>Reason (required)</Label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          )}
          {pendingAction?.action === "record_payment" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount ({invoice.currency})</Label>
                <Input
                  value={payment.amount}
                  onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                  placeholder="1234.56"
                />
              </div>
              <div className="space-y-1">
                <Label>Method</Label>
                <Input
                  value={payment.method}
                  onChange={(e) => setPayment({ ...payment, method: e.target.value })}
                />
              </div>
            </div>
          )}
          {pendingAction?.action === "credit_note" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Credit amount ({invoice.currency})</Label>
                <Input
                  value={credit.amount}
                  onChange={(e) => setCredit({ ...credit, amount: e.target.value })}
                  placeholder="500.00"
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={credit.description}
                  onChange={(e) => setCredit({ ...credit, description: e.target.value })}
                  placeholder="Correction for overbilled hours"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingAction?.destructive ? "destructive" : "default"}
              disabled={
                runAction.isPending ||
                (pendingAction?.requires_comment && comment.trim() === "")
              }
              onClick={() => pendingAction && runAction.mutate(pendingAction)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* In-app invoice sending (D-2) — logged to the client timeline */}
      <EmailComposer
        open={emailing}
        onClose={() => setEmailing(false)}
        to={invoice.clients?.contact_email ? [invoice.clients.contact_email] : []}
        templateVars={{
          client_name: invoice.clients?.name,
          invoice_number: invoice.number ?? undefined,
          amount: (invoice.total_minor / 100).toFixed(2),
          currency: invoice.currency,
          due_date: invoice.due_date ?? undefined,
        }}
        subject={`Invoice ${invoice.number} — ${formatMinor(invoice.total_minor, invoice.currency)}`}
        body={`Dear ${invoice.clients?.name},\n\nPlease find invoice ${invoice.number} for ${formatMinor(invoice.total_minor, invoice.currency)}, due ${invoice.due_date}.\n\n${(invoice.invoice_lines ?? [])
          .map((l) => `• ${l.description}: ${formatMinor(l.amount_minor, invoice.currency)}`)
          .join("\n")}\n\nThank you for your business.`}
        related={{
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          attach_invoice_pdf: true,
        }}
      />

      {/* Manual line dialog */}
      <Dialog open={showManualLine} onOpenChange={setShowManualLine}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add manual line</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Description (required)</Label>
              <Input
                value={manualLine.description}
                onChange={(e) =>
                  setManualLine({ ...manualLine, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Amount ({invoice.currency}; negative for discounts)</Label>
              <Input
                value={manualLine.amount}
                onChange={(e) => setManualLine({ ...manualLine, amount: e.target.value })}
                placeholder="-100.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!manualLine.description || addLineMutation.isPending}
              onClick={() => addLineMutation.mutate()}
            >
              Add line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
