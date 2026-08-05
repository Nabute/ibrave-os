import { BaseRepository } from "../base";
import type { WorkflowActions } from "../hateoas";
import type {
  Cadence,
  CadenceRun,
  Lead,
  Prospect,
  ProspectActivity,
  ProspectFunnelRow,
  SalesTask,
} from "../types";

/** Sales development (Module A §3a): prospects, cadences, the today queue. */
export class ProspectingRepository extends BaseRepository {
  prospects(): Promise<Prospect[]> {
    return this.query(
      this.db
        .from("prospects")
        .select("*")
        .order("fit_score", { ascending: false })
        .order("company")
    );
  }

  createProspect(p: Partial<Prospect> & { company: string }): Promise<Prospect> {
    return this.query(this.db.from("prospects").insert(p).select().single());
  }

  activities(prospectId: string): Promise<ProspectActivity[]> {
    return this.query(
      this.db
        .from("prospect_activities")
        .select("*")
        .eq("prospect_id", prospectId)
        .order("at", { ascending: false })
    );
  }

  prospectActions(prospectId: string): Promise<WorkflowActions> {
    return this.rpc("prospect_actions", { p_prospect_id: prospectId });
  }

  prospectAction(prospectId: string, action: string, comment?: string): Promise<Prospect> {
    return this.rpc("prospect_action", {
      p_prospect_id: prospectId,
      p_action: action,
      p_comment: comment ?? null,
    });
  }

  convert(prospectId: string): Promise<Lead> {
    return this.rpc("convert_prospect", { p_prospect_id: prospectId });
  }

  // -- cadences --------------------------------------------------------------

  cadences(): Promise<Cadence[]> {
    return this.query(this.db.from("cadences").select("*").order("name"));
  }

  createCadence(name: string, steps: Cadence["steps"]): Promise<Cadence> {
    return this.query(
      this.db.from("cadences").insert({ name, steps }).select().single()
    );
  }

  runs(): Promise<CadenceRun[]> {
    return this.query(
      this.db
        .from("cadence_runs")
        .select("*, cadences ( name, steps ), prospects ( company )")
        .order("started_at", { ascending: false })
    );
  }

  startCadence(prospectId: string, cadenceId: string): Promise<CadenceRun> {
    return this.rpc("start_cadence", {
      p_prospect_id: prospectId,
      p_cadence_id: cadenceId,
    });
  }

  stopCadence(runId: string, reason?: string): Promise<null> {
    return this.rpc("stop_cadence", { p_run_id: runId, p_reason: reason ?? null });
  }

  // -- today queue -----------------------------------------------------------

  myTasks(): Promise<SalesTask[]> {
    return this.query(
      this.db
        .from("sales_tasks")
        .select("*, prospects ( company ), clients ( name )")
        .is("done_at", null)
        .order("due_date")
    );
  }

  completeTask(taskId: string, note?: string): Promise<SalesTask> {
    return this.rpc("complete_sales_task", {
      p_task_id: taskId,
      p_note: note ?? null,
    });
  }

  addTask(task: {
    owner_id: string;
    prospect_id?: string | null;
    client_id?: string | null;
    kind: string;
    description: string;
    due_date: string;
  }): Promise<SalesTask> {
    return this.query(this.db.from("sales_tasks").insert(task).select().single());
  }

  funnel(): Promise<ProspectFunnelRow[]> {
    return this.query(this.db.from("v_prospect_funnel").select("*").order("source"));
  }
}
