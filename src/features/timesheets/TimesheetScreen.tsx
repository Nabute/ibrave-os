import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toDisplayMessage, type Task, type TimeEntry } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";
import { DAY_LABELS, shiftWeek, weekDays, weekEndOf, weekStartOf } from "@/lib/weeks";
import { cn } from "@/lib/utils";

/** A grid row = project (+ optional task). Cells = hours per day. */
interface GridRow {
  key: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
}

const STATUS_BADGE: Record<TimeEntry["status"], "secondary" | "warning" | "success"> = {
  draft: "secondary",
  submitted: "warning",
  approved: "success",
};

export function TimesheetScreen() {
  const api = useApi();
  const { userId } = useSession();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const entriesQuery = useQuery({
    queryKey: ["timesheet", userId, weekStart],
    queryFn: () => api.timesheets.week(userId!, weekStart, weekEndOf(weekStart)),
    enabled: !!userId,
  });

  const assignmentsQuery = useQuery({
    queryKey: ["my-assignments", userId],
    queryFn: () => api.timesheets.myAssignments(userId!),
    enabled: !!userId,
  });

  const projectIds = useMemo(
    () => [...new Set((assignmentsQuery.data ?? []).map((a) => a.project_id))],
    [assignmentsQuery.data]
  );

  const tasksQuery = useQuery({
    queryKey: ["tasks", projectIds],
    queryFn: () => api.timesheets.tasksFor(projectIds),
    enabled: projectIds.length > 0,
  });

  const entries = entriesQuery.data ?? [];
  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasksQuery.data ?? []) {
      map.set(t.project_id, [...(map.get(t.project_id) ?? []), t]);
    }
    return map;
  }, [tasksQuery.data]);

  // Rows: every project/task combination present in entries, plus any row the
  // user added this session.
  const [extraRows, setExtraRows] = useState<GridRow[]>([]);
  const rows = useMemo<GridRow[]>(() => {
    const map = new Map<string, GridRow>();
    for (const e of entries) {
      const key = `${e.project_id}:${e.task_id ?? ""}`;
      if (!map.has(key)) {
        const assignment = (assignmentsQuery.data ?? []).find(
          (a) => a.project_id === e.project_id
        );
        const task = (tasksQuery.data ?? []).find((t) => t.id === e.task_id);
        map.set(key, {
          key,
          projectId: e.project_id,
          projectName: assignment?.projects?.name ?? "Project",
          taskId: e.task_id,
          taskName: task?.name ?? null,
        });
      }
    }
    for (const r of extraRows) if (!map.has(r.key)) map.set(r.key, r);
    return [...map.values()].sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [entries, extraRows, assignmentsQuery.data, tasksQuery.data]);

  const entryAt = (row: GridRow, date: string): TimeEntry | undefined =>
    entries.find(
      (e) =>
        e.project_id === row.projectId &&
        (e.task_id ?? "") === (row.taskId ?? "") &&
        e.work_date === date &&
        !e.adjusts_entry_id
    );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["timesheet", userId, weekStart] });

  const saveMutation = useMutation({
    mutationFn: async ({
      row,
      date,
      hours,
      existing,
    }: {
      row: GridRow;
      date: string;
      hours: number;
      existing?: TimeEntry;
    }) => {
      if (hours === 0 && existing) {
        await api.timesheets.deleteEntry(existing.id);
      } else if (hours > 0) {
        await api.timesheets.saveEntry({
          id: existing?.id,
          user_id: userId!,
          project_id: row.projectId,
          task_id: row.taskId,
          work_date: date,
          hours,
        });
      }
    },
    onSuccess: invalidate,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.timesheets.submitWeek(weekStart),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const copyMutation = useMutation({
    mutationFn: () => api.timesheets.copyPreviousWeek(weekStart),
    onSuccess: invalidate,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const draftCount = entries.filter((e) => e.status === "draft").length;
  const rejected = entries.filter((e) => e.status === "draft" && e.rejection_comment);

  function addRow(projectId: string, taskId: string | null) {
    const assignment = (assignmentsQuery.data ?? []).find((a) => a.project_id === projectId);
    const task = (tasksQuery.data ?? []).find((t) => t.id === taskId);
    const key = `${projectId}:${taskId ?? ""}`;
    setExtraRows((prev) =>
      prev.some((r) => r.key === key)
        ? prev
        : [
            ...prev,
            {
              key,
              projectId,
              projectName: assignment?.projects?.name ?? "Project",
              taskId,
              taskName: task?.name ?? null,
            },
          ]
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Timesheet</h1>
          <p className="text-sm text-muted-foreground">
            0.25 h steps · drafts save on blur · submit locks the week for approval
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            Week of {weekStart}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {rejected.length > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4 text-sm">
            <p className="mb-1 font-medium text-destructive">Rejected entries to fix:</p>
            {rejected.map((e) => (
              <p key={e.id} className="text-muted-foreground">
                {e.work_date}: “{e.rejection_comment}”
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-64 py-2 pr-2 font-medium">Project / Task</th>
                  {days.map((d, i) => (
                    <th key={d} className="w-20 px-1 py-2 text-center font-medium">
                      {DAY_LABELS[i]}
                      <div className="text-xs font-normal">{d.slice(5)}</div>
                    </th>
                  ))}
                  <th className="w-16 py-2 text-right font-medium">Σ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowTotal = days.reduce(
                    (sum, d) => sum + Number(entryAt(row, d)?.hours ?? 0),
                    0
                  );
                  return (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="py-1 pr-2">
                        <div className="font-medium">{row.projectName}</div>
                        {row.taskName && (
                          <div className="text-xs text-muted-foreground">{row.taskName}</div>
                        )}
                      </td>
                      {days.map((d) => {
                        const entry = entryAt(row, d);
                        const locked = entry && entry.status !== "draft";
                        return (
                          <td key={d} className="px-1 py-1 text-center">
                            <HourCell
                              value={entry ? Number(entry.hours) : 0}
                              locked={!!locked}
                              status={entry?.status}
                              onCommit={(hours) =>
                                saveMutation.mutate({ row, date: d, hours, existing: entry })
                              }
                            />
                          </td>
                        );
                      })}
                      <td className="py-1 text-right font-medium tabular-nums">
                        {rowTotal > 0 ? rowTotal : ""}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-2 text-right text-xs text-muted-foreground" />
                  {days.map((d) => {
                    const total = rows.reduce(
                      (sum, r) => sum + Number(entryAt(r, d)?.hours ?? 0),
                      0
                    );
                    return (
                      <td
                        key={d}
                        className={cn(
                          "py-2 text-center text-xs font-medium tabular-nums",
                          total > 12 && "text-amber-600"
                        )}
                      >
                        {total > 0 ? total : ""}
                      </td>
                    );
                  })}
                  <td className="py-2 text-right text-sm font-semibold tabular-nums">
                    {entries.reduce((s, e) => s + Number(e.hours), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <AddRowPicker
              assignments={assignmentsQuery.data ?? []}
              tasksByProject={tasksByProject}
              existingKeys={rows.map((r) => r.key)}
              onAdd={addRow}
            />
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                onClick={() => copyMutation.mutate()}
                disabled={copyMutation.isPending}
              >
                <Copy className="h-4 w-4" /> Copy last week
              </Button>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={draftCount === 0 || submitMutation.isPending}
              >
                <Send className="h-4 w-4" /> Submit week ({draftCount})
              </Button>
            </div>
          </div>

          <div className="mt-3 flex gap-2 text-xs text-muted-foreground">
            {(["draft", "submitted", "approved"] as const).map((s) => (
              <Badge key={s} variant={STATUS_BADGE[s]}>
                {s}: {entries.filter((e) => e.status === s).length}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HourCell({
  value,
  locked,
  status,
  onCommit,
}: {
  value: number;
  locked: boolean;
  status?: TimeEntry["status"];
  onCommit: (hours: number) => void;
}) {
  const [text, setText] = useState(value > 0 ? String(value) : "");

  if (locked) {
    return (
      <span
        className={cn(
          "inline-block w-14 rounded px-1 py-1 tabular-nums",
          status === "approved" && "bg-emerald-50 text-emerald-700",
          status === "submitted" && "bg-amber-50 text-amber-700"
        )}
        title={status}
      >
        {value || ""}
      </span>
    );
  }

  return (
    <input
      className="w-14 rounded border border-transparent bg-transparent px-1 py-1 text-center tabular-nums outline-none transition-colors hover:border-input focus:border-ring focus:bg-background"
      value={text}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = text.trim() === "" ? 0 : Number(text);
        if (Number.isNaN(parsed) || parsed < 0 || (parsed * 4) % 1 !== 0) {
          setText(value > 0 ? String(value) : "");
          return;
        }
        if (parsed !== value) onCommit(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function AddRowPicker({
  assignments,
  tasksByProject,
  existingKeys,
  onAdd,
}: {
  assignments: { project_id: string; projects?: { name: string; status: string } }[];
  tasksByProject: Map<string, Task[]>;
  existingKeys: string[];
  onAdd: (projectId: string, taskId: string | null) => void;
}) {
  const options = useMemo(() => {
    const opts: { key: string; label: string; projectId: string; taskId: string | null }[] = [];
    const seen = new Set<string>();
    for (const a of assignments) {
      if (a.projects?.status !== "active" || seen.has(a.project_id)) continue;
      seen.add(a.project_id);
      const tasks = tasksByProject.get(a.project_id) ?? [];
      if (tasks.length === 0) {
        opts.push({
          key: `${a.project_id}:`,
          label: a.projects.name,
          projectId: a.project_id,
          taskId: null,
        });
      } else {
        for (const t of tasks) {
          opts.push({
            key: `${a.project_id}:${t.id}`,
            label: `${a.projects.name} — ${t.name}`,
            projectId: a.project_id,
            taskId: t.id,
          });
        }
      }
    }
    return opts.filter((o) => !existingKeys.includes(o.key));
  }, [assignments, tasksByProject, existingKeys]);

  if (options.length === 0) return null;

  return (
    <Select
      value=""
      onValueChange={(key) => {
        const opt = options.find((o) => o.key === key);
        if (opt) onAdd(opt.projectId, opt.taskId);
      }}
    >
      <SelectTrigger className="w-64">
        <SelectValue placeholder="+ Add project/task row" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
