import { BaseRepository } from "../base";
import type { WorkflowActions } from "../hateoas";
import type {
  BenchRow,
  CandidateSuggestion,
  CapacityMonth,
  PersonSkill,
  Skill,
  StaffingRequest,
  TimeOff,
} from "../types";

/** Staffing & bench (Module B). */
export class StaffingRepository extends BaseRepository {
  bench(from?: string, to?: string): Promise<BenchRow[]> {
    return this.rpc("bench", from && to ? { p_from: from, p_to: to } : {});
  }

  capacityForecast(months = 6): Promise<CapacityMonth[]> {
    return this.rpc("capacity_forecast", { p_months: months });
  }

  requests(): Promise<StaffingRequest[]> {
    return this.query(
      this.db
        .from("staffing_requests")
        .select("*, projects ( id, name )")
        .order("created_at", { ascending: false })
    );
  }

  createRequest(req: {
    project_id: string | null;
    role_title: string;
    skills: string[];
    seniority: string | null;
    allocation_pct: number;
    start_date: string;
    duration_weeks: number | null;
    notes?: string;
  }): Promise<StaffingRequest> {
    return this.query(
      this.db.from("staffing_requests").insert(req).select().single()
    );
  }

  suggestCandidates(requestId: string): Promise<CandidateSuggestion[]> {
    return this.rpc("suggest_candidates", { p_request_id: requestId });
  }

  fillRequest(requestId: string, userId: string): Promise<StaffingRequest> {
    return this.rpc("fill_staffing_request", {
      p_request_id: requestId,
      p_user_id: userId,
    });
  }

  cancelRequest(requestId: string, comment: string): Promise<StaffingRequest> {
    return this.rpc("cancel_staffing_request", {
      p_request_id: requestId,
      p_comment: comment,
    });
  }

  requestActions(requestId: string): Promise<WorkflowActions> {
    return this.rpc("staffing_request_actions", { p_request_id: requestId });
  }

  // -- skills ----------------------------------------------------------------

  skills(): Promise<Skill[]> {
    return this.query(this.db.from("skills").select("*").order("name"));
  }

  addSkill(name: string): Promise<Skill> {
    return this.query(this.db.from("skills").insert({ name }).select().single());
  }

  personSkills(): Promise<PersonSkill[]> {
    return this.query(
      this.db.from("person_skills").select("*, skills ( name ), profiles ( full_name )")
    );
  }

  setPersonSkill(userId: string, skillId: string, level: string): Promise<PersonSkill> {
    return this.query(
      this.db
        .from("person_skills")
        .upsert({ user_id: userId, skill_id: skillId, level })
        .select()
        .single()
    );
  }

  removePersonSkill(userId: string, skillId: string): Promise<null> {
    return this.query(
      this.db.from("person_skills").delete().eq("user_id", userId).eq("skill_id", skillId)
    );
  }

  // -- time off --------------------------------------------------------------

  timeOff(): Promise<TimeOff[]> {
    return this.query(
      this.db
        .from("time_off")
        .select("*, profiles ( full_name )")
        .order("start_date", { ascending: false })
    );
  }

  addTimeOff(entry: {
    user_id: string;
    start_date: string;
    end_date: string;
    kind: string;
    note?: string;
  }): Promise<TimeOff> {
    return this.query(this.db.from("time_off").insert(entry).select().single());
  }

  removeTimeOff(id: string): Promise<null> {
    return this.query(this.db.from("time_off").delete().eq("id", id));
  }
}
