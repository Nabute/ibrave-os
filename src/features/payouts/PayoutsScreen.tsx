import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TableSkeleton } from "@/components/Skeletons";
import { Link, useNavigate } from "@tanstack/react-router";
import { format, endOfMonth, startOfMonth, subMonths } from "date-fns";
import { HandCoins } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toDisplayMessage, type PayoutStatus } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { useApi } from "@/lib/session";
import type { BadgeProps } from "@/components/ui/badge";

export const PAYOUT_BADGE: Record<PayoutStatus, NonNullable<BadgeProps["variant"]>> = {
  draft: "secondary",
  confirmed: "warning",
  paid: "success",
};

export function PayoutsScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastMonth = subMonths(new Date(), 1);
  const [form, setForm] = useState({
    periodStart: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
    periodEnd: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
  });

  const { data: statements, isLoading } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => api.payouts.list(),
  });
  const { data: reconciliation } = useQuery({
    queryKey: ["payout-reconciliation"],
    queryFn: () => api.payouts.reconciliation(),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.payouts.generate(form.periodStart, form.periodEnd),
    onSuccess: (created) => {
      setOpen(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["payouts"] });
      void qc.invalidateQueries({ queryKey: ["payout-reconciliation"] });
      if (created.length === 1) {
        void navigate({ to: "/payouts/$payoutId", params: { payoutId: created[0].id } });
      }
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const problems = (reconciliation ?? []).filter(
    (r) => r.missing_cost_rate || Number(r.unpaid_hours) !== 0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1>Payouts</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Statements are computed from the same approved hours your invoices bill —
            margin falls out for free.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <HandCoins className="h-4 w-4" /> Draft statements
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Draft payout statements</DialogTitle>
              <DialogDescription>
                One draft per person with approved, not-yet-paid hours in the period.
                People without a cost rate are skipped — check the reconciliation
                panel below.
              </DialogDescription>
            </DialogHeader>
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
            <DialogFooter>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? "Generating…" : "Generate drafts"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Confirmed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(statements ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      to="/payouts/$payoutId"
                      params={{ payoutId: s.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.profiles?.full_name}
                    </Link>
                    {s.profiles?.employment_type === "contractor" && (
                      <span className="ml-2 text-xs text-muted-foreground">contractor</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.period_start} → {s.period_end}
                  </TableCell>
                  <TableCell>
                    <Badge variant={PAYOUT_BADGE[s.status]}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(s.total_minor, s.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.confirmed_at ? new Date(s.confirmed_at).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
          {(statements ?? []).length === 0 && (
            <EmptyState
              icon={HandCoins}
              description="Statements are computed from approved hours × cost rates — the same records that back the invoices."
              sentence="No payout statements yet"
              action="Draft statements for a period"
              onAction={() => setOpen(true)}
            />
          )}
        </CardContent>
      </Card>

      <Card className={problems.length > 0 ? "border-warning-foreground/30" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Reconciliation guard</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Hours billed vs hours paid out must reconcile — differences are shown, never
            hidden.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Approved h</TableHead>
                <TableHead className="text-right">Billed h</TableHead>
                <TableHead className="text-right">Paid out h</TableHead>
                <TableHead className="text-right">Unpaid h</TableHead>
                <TableHead>Cost rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reconciliation ?? []).map((r) => (
                <TableRow key={`${r.user_id}:${r.month}`}>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell>{r.month.slice(0, 7)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.approved_hours}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.billed_hours ?? 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.paid_out_hours}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.unpaid_hours) !== 0 ? (
                      <Badge variant="warning">{r.unpaid_hours}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.missing_cost_rate ? (
                      <Badge variant="destructive">missing</Badge>
                    ) : (
                      <Badge variant="success">set</Badge>
                    )}
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
