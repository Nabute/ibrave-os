import { BaseRepository } from "../base";
import type { WorkflowActions } from "../hateoas";
import type { Assignment, Task, TimeEntry } from "../types";

/** Weekly grid + entry lifecycle (spec §3.1, FR-6..FR-11). */
export class TimesheetsRepository extends BaseRepository {
  /** My entries for the week starting at `weekStart` (a Monday, YYYY-MM-DD). */
  week(userId: string, weekStart: string, weekEnd: string): Promise<TimeEntry[]> {
    return this.query(
      this.db
        .from("time_entries")
        .select("*")
        .eq("user_id", userId)
        .gte("work_date", weekStart)
        .lte("work_date", weekEnd)
        .order("work_date")
    );
  }

  /** Projects I can log to on a given date (assignment-scoped, C-1). */
  myAssignments(userId: string): Promise<Assignment[]> {
    return this.query(
      this.db
        .from("assignments")
        .select("*, projects ( id, name, status, client_id, clients ( name ) )")
        .eq("user_id", userId)
        .order("start_date", { ascending: false })
    );
  }

  tasksFor(projectIds: string[]): Promise<Task[]> {
    return this.query(
      this.db.from("tasks").select("*").in("project_id", projectIds).eq("status", "open")
    );
  }

  saveEntry(entry: {
    id?: string;
    user_id: string;
    project_id: string;
    task_id: string | null;
    work_date: string;
    hours: number;
    note?: string | null;
    billable?: boolean;
  }): Promise<TimeEntry> {
    return this.query(
      this.db.from("time_entries").upsert(entry).select().single()
    );
  }

  deleteEntry(id: string): Promise<null> {
    return this.query(this.db.from("time_entries").delete().eq("id", id));
  }

  // -- workflow actions (RPC only; never direct status writes) --------------

  submitWeek(weekStart: string): Promise<TimeEntry[]> {
    return this.rpc("submit_week", { p_week_start: weekStart });
  }

  copyPreviousWeek(weekStart: string): Promise<TimeEntry[]> {
    return this.rpc("copy_previous_week", { p_week_start: weekStart });
  }

  createAdjustment(entryId: string, hours: number, note: string): Promise<TimeEntry> {
    return this.rpc("create_adjustment", {
      p_entry_id: entryId,
      p_hours: hours,
      p_note: note,
    });
  }

  /** HATEOAS: what can I do with this entry right now? */
  entryActions(entryId: string): Promise<WorkflowActions> {
    return this.rpc("time_entry_actions", { p_entry_id: entryId });
  }
}
