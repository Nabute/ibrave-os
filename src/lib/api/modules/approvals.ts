import { BaseRepository } from "../base";
import type { ApprovalQueueRow, TimeEntry } from "../types";

/** PM approval flow (spec §3.2). RLS scopes the queue to the PM's projects. */
export class ApprovalsRepository extends BaseRepository {
  queue(): Promise<ApprovalQueueRow[]> {
    return this.query(
      this.db
        .from("v_approval_queue")
        .select("*")
        .order("week_start", { ascending: false })
        .order("full_name")
    );
  }

  approve(entryIds: string[]): Promise<TimeEntry[]> {
    return this.rpc("approve_entries", { p_entry_ids: entryIds });
  }

  reject(entryId: string, comment: string): Promise<TimeEntry> {
    return this.rpc("reject_entry", { p_entry_id: entryId, p_comment: comment });
  }
}
