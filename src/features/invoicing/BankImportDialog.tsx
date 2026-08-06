import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toDisplayMessage, type AgingRow } from "@/lib/api";
import { formatMinor, parseToMinor } from "@/lib/money";
import { useApi } from "@/lib/session";

interface ParsedRow {
  line: string;
  amountMinor: number | null;
  match: AgingRow | null;
  confidence: "number" | "amount" | null;
  applied: boolean;
}

/**
 * Bank CSV matcher (D-4 hardening): paste a bank statement export; rows are
 * matched to open invoices by invoice number in the reference (high
 * confidence) or exact outstanding amount (medium). One click records the
 * payment through the normal record_payment RPC.
 */
export function BankImportDialog() {
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const { data: aging } = useQuery({
    queryKey: ["r-aging"],
    queryFn: () => api.reports.aging(),
    enabled: open,
  });

  const rows = useMemo<ParsedRow[]>(() => {
    if (!raw.trim() || !aging) return [];
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        // amount: the last cell that parses as money
        const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
        let amountMinor: number | null = null;
        for (let i = cells.length - 1; i >= 0; i--) {
          const m = parseToMinor(cells[i]);
          if (m != null && m !== 0) {
            amountMinor = Math.abs(m);
            break;
          }
        }
        const upper = line.toUpperCase();
        const byNumber = aging.find((inv) => inv.number && upper.includes(inv.number.toUpperCase()));
        const byAmount =
          amountMinor != null
            ? aging.find((inv) => inv.outstanding_minor === amountMinor)
            : undefined;
        const match = byNumber ?? byAmount ?? null;
        return {
          line,
          amountMinor,
          match,
          confidence: byNumber ? "number" : byAmount ? "amount" : null,
          applied: false,
        } as ParsedRow;
      });
  }, [raw, aging]);

  const applyMutation = useMutation({
    mutationFn: (row: ParsedRow) =>
      api.invoices.recordPayment(
        row.match!.id,
        row.amountMinor ?? row.match!.outstanding_minor,
        new Date().toISOString().slice(0, 10),
        "bank transfer",
        `Bank import: ${row.line.slice(0, 120)}`
      ),
    onSuccess: (_r, row) => {
      setApplied((s) => new Set(s).add(row.line));
      setError(null);
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["r-aging"] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Landmark className="h-4 w-4" /> Import bank CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-[880px] max-w-[92vw] flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="font-display text-2xl tracking-tight">
            Match bank statement
          </DialogTitle>
          <DialogDescription>
            Paste rows from your bank's CSV export. Matches by invoice number in the
            reference (high confidence) or exact outstanding amount. Nothing is recorded
            until you apply a row.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <Textarea
          rows={5}
          className="font-mono text-xs"
          placeholder={`2026-08-05,ACME PAYMENT INV-2026-0001,13880.00\n2026-08-06,WIRE GLOBEX,5000.00`}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Statement row</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Suggested invoice</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="max-w-64 truncate font-mono text-xs">
                    {row.line}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.amountMinor != null
                      ? formatMinor(row.amountMinor, row.match?.currency ?? "USD")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {row.match ? (
                      <span>
                        {row.match.number}
                        <Badge
                          className="ml-2 align-middle"
                          variant={row.confidence === "number" ? "success" : "warning"}
                        >
                          {row.confidence === "number" ? "number match" : "amount match"}
                        </Badge>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">no match</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.match &&
                      (applied.has(row.line) ? (
                        <Badge variant="success">recorded</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => applyMutation.mutate(row)}
                          disabled={applyMutation.isPending}
                        >
                          Record payment
                        </Button>
                      ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
