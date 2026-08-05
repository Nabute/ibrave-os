import { BaseRepository } from "../base";
import type { WorkflowActions } from "../hateoas";
import type {
  Candidate,
  CandidateActivity,
  EngagementRow,
  InterviewRound,
  Offer,
  OnboardingTask,
  Profile,
  RecruitingFunnelRow,
  Requisition,
  UtilizationRow,
} from "../types";

/** Talent acquisition + Talent 360 (Module H). */
export class TalentRepository extends BaseRepository {
  requisitions(): Promise<Requisition[]> {
    return this.query(
      this.db.from("requisitions").select("*").order("opened_at", { ascending: false })
    );
  }

  createRequisition(
    req: Partial<Requisition> & { role_title: string }
  ): Promise<Requisition> {
    return this.query(this.db.from("requisitions").insert(req).select().single());
  }

  candidates(): Promise<Candidate[]> {
    return this.query(
      this.db
        .from("candidates")
        .select("*, requisitions ( role_title )")
        .order("updated_at", { ascending: false })
    );
  }

  createCandidate(c: Partial<Candidate> & { full_name: string }): Promise<Candidate> {
    return this.query(this.db.from("candidates").insert(c).select().single());
  }

  activities(candidateId: string): Promise<CandidateActivity[]> {
    return this.query(
      this.db
        .from("candidate_activities")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("at", { ascending: false })
    );
  }

  // -- workflow --------------------------------------------------------------

  candidateActions(candidateId: string): Promise<WorkflowActions> {
    return this.rpc("candidate_actions", { p_candidate_id: candidateId });
  }

  candidateAction(candidateId: string, action: string, comment?: string): Promise<Candidate> {
    return this.rpc("candidate_action", {
      p_candidate_id: candidateId,
      p_action: action,
      p_comment: comment ?? null,
    });
  }

  recordOffer(
    candidateId: string,
    rateMinor: number,
    ratePeriod: "hourly" | "monthly",
    startDate: string | null
  ): Promise<Offer> {
    return this.rpc("record_offer", {
      p_candidate_id: candidateId,
      p_rate_minor: rateMinor,
      p_rate_period: ratePeriod,
      p_start_date: startDate,
    });
  }

  hire(candidateId: string): Promise<OnboardingTask[]> {
    return this.rpc("hire_candidate", { p_candidate_id: candidateId });
  }

  // -- interviews (H-3) ------------------------------------------------------

  rounds(candidateId: string): Promise<InterviewRound[]> {
    return this.query(
      this.db
        .from("interview_rounds")
        .select("*, profiles ( full_name )")
        .eq("candidate_id", candidateId)
        .order("round_no")
    );
  }

  addRound(candidateId: string, roundNo: number, interviewerId: string): Promise<InterviewRound> {
    return this.query(
      this.db
        .from("interview_rounds")
        .insert({ candidate_id: candidateId, round_no: roundNo, interviewer_id: interviewerId })
        .select()
        .single()
    );
  }

  submitScorecard(
    roundId: string,
    scorecard: { criterion: string; score_1_5: number; notes: string }[],
    recommendation: string
  ): Promise<InterviewRound> {
    return this.query(
      this.db
        .from("interview_rounds")
        .update({ scorecard, recommendation, submitted_at: new Date().toISOString() })
        .eq("id", roundId)
        .select()
        .single()
    );
  }

  offers(candidateId: string): Promise<Offer[]> {
    return this.query(
      this.db.from("offers").select("*").eq("candidate_id", candidateId).order("sent_at")
    );
  }

  onboarding(): Promise<OnboardingTask[]> {
    return this.query(
      this.db
        .from("onboarding_tasks")
        .select("*, candidates ( full_name ), profiles ( full_name )")
        .is("done_at", null)
        .order("due_date")
    );
  }

  completeOnboardingTask(id: string): Promise<OnboardingTask> {
    return this.query(
      this.db
        .from("onboarding_tasks")
        .update({ done_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()
    );
  }

  // -- Talent 360 (H-7) ------------------------------------------------------

  people(): Promise<Profile[]> {
    return this.query(
      this.db.from("profiles").select("*").eq("active", true).order("full_name")
    );
  }

  person(userId: string): Promise<Profile> {
    return this.query(this.db.from("profiles").select("*").eq("id", userId).single());
  }

  engagementHistory(userId: string): Promise<EngagementRow[]> {
    return this.query(
      this.db
        .from("v_engagement_history")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false })
    );
  }

  utilization(userId: string): Promise<UtilizationRow[]> {
    return this.query(
      this.db
        .from("v_utilization")
        .select("*")
        .eq("user_id", userId)
        .order("month", { ascending: false })
        .limit(6)
    );
  }

  funnel(): Promise<RecruitingFunnelRow[]> {
    return this.query(this.db.from("v_recruiting_funnel").select("*").order("source"));
  }
}
