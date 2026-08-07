import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Banknote, Download, FilePlus2 } from "lucide-react";
import { format, startOfMonth, subMonths } from "date-fns";
import { useMemo, useState } from "react";

import { SortHead } from "@/components/SortHead";
import { BulkActionBar, RowCheckbox, TableToolbar } from "@/components/TableToolbar";
import { useTableControls } from "@/lib/useTableControls";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/Skeletons";
import { useSort } from "@/lib/useSort";

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

/** Bulk export: the selected invoices as a flat CSV for finance. */
function downloadInvoicesCsv(rows: { number: string | null; client_name: string; status: string; total_minor: number; currency: string; due_date: string | null }[]) {
  if (rows.length === 0) return;
  const csv = [
    "number,client,status,total,currency,due_date",
    ...rows.map((r) =>
      [r.number ?? "draft", `"${r.client_name}"`, r.status, (r.total_minor / 100).toFixed(2), r.currency, r.due_date ?? ""].join(",")
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "invoices.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.invoices.list(),
  });
  const sortableRows = useMemo(
    () =>
      (invoices ?? []).map((inv) => ({
        ...inv,
        client_name: inv.clients?.name ?? "",
      })),
    [invoices]
  );
  const controls = useTableControls(sortableRows, {
    getId: (i) => i.id,
    haystack: (i) => `${i.number ?? "draft"} ${i.client_name} ${i.status} ${i.kind}`,
    facets: [
      { key: "status", label: "Status", get: (i) => i.status },
      { key: "kind", label: "Kind", get: (i) => i.kind },
    ],
  });
  const sort = useSort(controls.rows, "created_at");
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
          {isLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : sort.rows.length === 0 ? (
            <EmptyState
              icon={Banknote}
              sentence="No invoices yet"
              description="Generate a draft from approved, un-invoiced work, the system prices every entry from the rate card effective on its work date."
              action="Generate draft"
              onAction={() => setOpen(true)}
            />
          ) : (
          <>
          <TableToolbar
            query={controls.query}
            onQuery={controls.setQuery}
            facets={controls.facets}
            count={controls.rows.length}
            total={sortableRows.length}
            placeholder="Search number, client, status"
          />
          <BulkActionBar
            count={controls.selection.count}
            onClear={controls.selection.clear}
            noun="invoice"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadInvoicesCsv(controls.selection.rows)}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </BulkActionBar>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <RowCheckbox
                    checked={controls.selection.allVisible}
                    onChange={controls.selection.toggleAll}
                    label="Select all invoices"
                  />
                </TableHead>
                <SortHead sortKey="number" current={sort.sortKey} dir={sort.dir} onSort={sort.toggle}>
                  Number
                </SortHead>
                <SortHead sortKey="client_name" current={sort.sortKey} dir={sort.dir} onSort={sort.toggle}>
                  Client
                </SortHead>
                <TableHead>Kind</TableHead>
                <TableHead>Period</TableHead>
                <SortHead sortKey="status" current={sort.sortKey} dir={sort.dir} onSort={sort.toggle}>
                  Status
                </SortHead>
                <SortHead sortKey="total_minor" current={sort.sortKey} dir={sort.dir} onSort={sort.toggle} className="text-right">
                  Total
                </SortHead>
                <SortHead sortKey="due_date" current={sort.sortKey} dir={sort.dir} onSort={sort.toggle}>
                  Due
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sort.rows.map((inv) => (
                <TableRow
                  key={inv.id}
                  className={controls.selection.has(inv.id) ? "bg-brass/5 shadow-[inset_2px_0_0_0_hsl(var(--brass))]" : ""}
                >
                  <TableCell className="w-8">
                    <RowCheckbox
                      checked={controls.selection.has(inv.id)}
                      onChange={() => controls.selection.toggle(inv.id)}
                      label={`Select ${inv.number ?? "draft"}`}
                    />
                  </TableCell>
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
                    {inv.period_start ? `${inv.period_start} → ${inv.period_end}` : "-"}
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
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
