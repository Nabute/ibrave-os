import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";

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

  if (!invoice) return null;

  const isDraft = invoice.status === "draft";
  const needsDialog = (a: WorkflowAction) =>
    a.requires_comment || ["record_payment", "credit_note"].includes(a.action);
  const paidTotal = (invoice.payments ?? []).reduce((s, p) => s + p.amount_minor, 0);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
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
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="no-print rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Printable document */}
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="pt-6">
          <div className="mb-6 flex justify-between">
            <div>
              <p className="text-lg font-semibold">iBrave</p>
              <p className="text-sm text-muted-foreground">Outsourcing & Engineering Services</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{invoice.number ?? "DRAFT"}</p>
              {invoice.issued_at && (
                <p>Issued {new Date(invoice.issued_at).toLocaleDateString()}</p>
              )}
              {invoice.due_date && <p>Due {invoice.due_date}</p>}
            </div>
          </div>
          <div className="mb-6 text-sm">
            <p className="font-medium">Bill to</p>
            <p>{invoice.clients?.name}</p>
            {invoice.clients?.billing_address && (
              <p className="whitespace-pre-line text-muted-foreground">
                {invoice.clients.billing_address}
              </p>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {isDraft && <TableHead className="no-print w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoice.invoice_lines ?? [])
                .sort((a, b) => a.position - b.position)
                .map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      {line.description}
                      <span className="ml-2 text-xs text-muted-foreground">{line.kind}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinor(line.unit_price_minor, invoice.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinor(line.amount_minor, invoice.currency)}
                    </TableCell>
                    {isDraft && (
                      <TableCell className="no-print">
                        {line.kind === "manual" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteLineMutation.mutate(line.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          {isDraft && (
            <div className="no-print mt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowManualLine(true)}>
                <Plus className="h-4 w-4" /> Manual line (discount, fee, credit)
              </Button>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {formatMinor(invoice.subtotal_minor, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">
                  {formatMinor(invoice.tax_total_minor, invoice.currency)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatMinor(invoice.total_minor, invoice.currency)}
                </span>
              </div>
              {paidTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid</span>
                  <span className="tabular-nums">{formatMinor(paidTotal, invoice.currency)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
