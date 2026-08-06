import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toDisplayMessage, type ApprovalQueueRow } from "@/lib/api";
import { useApi } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Queue grouped by person + week; row selection, bulk approve, reject-with-comment. */
export function ApprovalsScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalQueueRow | null>(null);
  const [comment, setComment] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { data: queue, isLoading } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: () => api.approvals.queue(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["approval-queue"] });
    void qc.invalidateQueries({ queryKey: ["my-day"] });
  };

  const approveMutation = useMutation({
    mutationFn: (ids: string[]) => api.approvals.approve(ids),
    onSuccess: (_data, ids) => {
      setError(null);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.approvals.reject(id, comment),
    onSuccess: () => {
      setError(null);
      setRejecting(null);
      setComment("");
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const groups = useMemo(() => {
    const map = new Map<string, ApprovalQueueRow[]>();
    for (const row of queue ?? []) {
      const key = `${row.user_id}:${row.week_start}`;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.values()];
  }, [queue]);

  return (
    <div className="space-y-4">
      <div>
        <h1>Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Submitted timesheets on your projects. Approval is final — corrections
          afterwards are adjustment entries.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!isLoading && groups.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState sentence="Queue is empty — nothing waiting on you." />
          </CardContent>
        </Card>
      )}

      {groups.map((rows) => {
        const first = rows[0];
        const total = rows.reduce((s, r) => s + Number(r.hours), 0);
        const selectedHere = rows.filter((r) => selected.has(r.id));
        const allSelected = selectedHere.length === rows.length;
        return (
          <Card key={`${first.user_id}:${first.week_start}`}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">
                {first.full_name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  week of {first.week_start} · {total} h
                </span>
              </CardTitle>
              <div className="flex gap-2">
                {selectedHere.length > 0 && !allSelected && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => approveMutation.mutate(selectedHere.map((r) => r.id))}
                    disabled={approveMutation.isPending}
                  >
                    <Check className="h-4 w-4" /> Approve selected ({selectedHere.length})
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate(rows.map((r) => r.id))}
                  disabled={approveMutation.isPending}
                >
                  <Check className="h-4 w-4" /> Approve all
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all entries in this week"
                        className="h-4 w-4 accent-[hsl(var(--brass))]"
                        checked={allSelected}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            for (const r of rows) {
                              if (allSelected) next.delete(r.id);
                              else next.add(r.id);
                            }
                            return next;
                          })
                        }
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(
                        selected.has(row.id) &&
                          "bg-brass/5 shadow-[inset_2px_0_0_0_hsl(var(--brass))]"
                      )}
                    >
                      <TableCell className="w-8">
                        <input
                          type="checkbox"
                          aria-label={`Select entry ${row.work_date}`}
                          className="h-4 w-4 accent-[hsl(var(--brass))]"
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                        />
                      </TableCell>
                      <TableCell>{row.work_date}</TableCell>
                      <TableCell>{row.project_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.task_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.hours}</TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {row.note ?? ""}
                      </TableCell>
                      <TableCell>
                        {row.billable ? (
                          <Badge variant="success">billable</Badge>
                        ) : (
                          <Badge variant="secondary">internal</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => approveMutation.mutate([row.id])}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setRejecting(row)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject entry</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {rejecting?.full_name} · {rejecting?.work_date} · {rejecting?.hours} h on{" "}
            {rejecting?.project_name}. The entry returns to draft with your comment.
          </p>
          <Textarea
            placeholder="Why is this entry being rejected? (required)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={comment.trim() === "" || rejectMutation.isPending}
              onClick={() =>
                rejecting && rejectMutation.mutate({ id: rejecting.id, comment })
              }
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
