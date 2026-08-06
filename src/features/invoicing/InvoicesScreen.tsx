import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2 } from "lucide-react";
import { format, startOfMonth, subMonths } from "date-fns";
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
import { toDisplayMessage } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { useApi } from "@/lib/session";
import { BankImportDialog } from "./BankImportDialog";
import { INVOICE_BADGE } from "./status";

export function InvoicesScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastMonthStart = startOfMonth(subMonths(new Date(), 1));
  const [form, setForm] = useState({
    clientId: "",
    periodStart: format(lastMonthStart, "yyyy-MM-dd"),
    periodEnd: format(subMonths(startOfMonth(new Date()), 0), "yyyy-MM-dd"),
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.invoices.list(),
  });
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.clients.list(),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.invoices.generateDraft(form.clientId, form.periodStart, form.periodEnd),
    onSuccess: (invoice) => {
      setOpen(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1>Invoices</h1>
          <p className="text-sm text-muted-foreground">
            The system prepares drafts; you review and issue the ones that move money.
          </p>
        </div>
        <div className="flex gap-2">
          <BankImportDialog />
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <FilePlus2 className="h-4 w-4" /> Generate draft
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate draft invoice</DialogTitle>
              <DialogDescription>
                Gathers approved, un-invoiced entries priced from the rate card effective on
                each work date, plus retainer and ready-to-bill milestone lines.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Client</Label>
                <Select
                  value={form.clientId}
                  onValueChange={(v) => setForm({ ...form, clientId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Period start</Label>
                  <Input
                    type="date"
                    value={form.periodStart}
                    onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Period end</Label>
                  <Input
                    type="date"
                    value={form.periodEnd}
                    onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={!form.clientId || generateMutation.isPending}
              >
                {generateMutation.isPending ? "Generating…" : "Generate"}
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Period</TableHead>
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
                  <TableCell>{inv.clients?.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {inv.kind === "credit_note" ? "credit note" : "invoice"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {inv.period_start ? `${inv.period_start} → ${inv.period_end}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={INVOICE_BADGE[inv.status]}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(inv.total_minor, inv.currency)}
                  </TableCell>
                  <TableCell>{inv.due_date ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
