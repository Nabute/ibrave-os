import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailSkeleton } from "@/components/Skeletons";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Printer, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionList, toDisplayMessage, type WorkflowAction } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { useApi, useSession } from "@/lib/session";
import { PAYOUT_BADGE } from "./PayoutsScreen";

/** Statement workspace, HATEOAS-driven confirm / mark-paid, print view. */
export function PayoutDetailScreen() {
  const { payoutId } = useParams({ strict: false }) as { payoutId: string };
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { hasRole } = useSession();
  const [error, setError] = useState<string | null>(null);

  const { data: statement } = useQuery({
    queryKey: ["payout", payoutId],
    queryFn: () => api.payouts.get(payoutId),
  });
  const { data: actions } = useQuery({
    queryKey: ["payout-actions", payoutId, statement?.status],
    queryFn: () => api.payouts.actions(payoutId),
    enabled: !!statement && hasRole("finance"),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["payout", payoutId] });
    void qc.invalidateQueries({ queryKey: ["payout-actions", payoutId] });
    void qc.invalidateQueries({ queryKey: ["payouts"] });
  };

  const runAction = useMutation({
    mutationFn: (action: WorkflowAction) => {
      switch (action.action) {
        case "confirm":
          return api.payouts.confirm(payoutId);
        case "mark_paid":
          return api.payouts.markPaid(payoutId);
        default:
          throw new Error(`Unknown action ${action.action}`);
      }
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.payouts.deleteDraft(payoutId),
    onSuccess: () => void navigate({ to: "/payouts" }),
    onError: (e) => setError(toDisplayMessage(e)),
  });

  if (!statement) return <DetailSkeleton />;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>
            {statement.profiles?.full_name}{" "}
            <Badge variant={PAYOUT_BADGE[statement.status]} className="align-middle">
              {statement.status}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Payout statement · {statement.period_start} → {statement.period_end}
          </p>
        </div>
        <div className="flex gap-2">
          {actionList(actions).map((a) => (
            <Button
              key={a.action}
              variant={a.destructive ? "destructive" : "default"}
              onClick={() => runAction.mutate(a)}
              disabled={runAction.isPending}
            >
              {a.label}
            </Button>
          ))}
          {statement.status === "draft" && hasRole("finance") && (
            <Button
              variant="outline"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" /> Discard draft
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      {error && (
        <p className="no-print rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card className="mx-auto w-full max-w-[920px] print:max-w-none print:border-0 print:shadow-none">
        <CardContent className="pt-6">
          <div className="mb-6 flex justify-between">
            <div>
              <p className="font-display text-lg">ibrave</p>
              <p className="text-sm text-muted-foreground">Contractor payout statement</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{statement.profiles?.full_name}</p>
              <p>
                {statement.period_start} → {statement.period_end}
              </p>
              {statement.confirmed_at && (
                <p>Confirmed {new Date(statement.confirmed_at).toLocaleDateString()}</p>
              )}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(statement.payout_lines ?? []).map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.projects?.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.hours}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(line.rate_minor, statement.currency)}/h
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(line.amount_minor, statement.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatMinor(statement.total_minor, statement.currency)}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Every line traces to individual approved time entries. Actual transfer is
            executed through your bank/payroll; this statement prepares and tracks it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
