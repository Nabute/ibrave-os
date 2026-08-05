import { BaseRepository } from "../base";
import type {
  Account360,
  AccountActivity,
  AccountHealth,
  Escalation,
  FeedbackPulse,
  Opportunity,
} from "../types";

/** Client & account management (Module G). */
export class AccountsRepository extends BaseRepository {
  account360(clientId: string): Promise<Account360> {
    return this.rpc("account_360", { p_client_id: clientId });
  }

  health(): Promise<AccountHealth[]> {
    return this.query(this.db.from("account_health").select("*"));
  }

  activities(clientId: string): Promise<AccountActivity[]> {
    return this.query(
      this.db
        .from("account_activities")
        .select("*, profiles ( full_name )")
        .eq("client_id", clientId)
        .order("at", { ascending: false })
        .limit(50)
    );
  }

  logActivity(
    clientId: string,
    kind: string,
    body: string,
    actorId: string
  ): Promise<AccountActivity> {
    return this.query(
      this.db
        .from("account_activities")
        .insert({ client_id: clientId, kind, body, actor_id: actorId })
        .select()
        .single()
    );
  }

  opportunities(clientId: string): Promise<Opportunity[]> {
    return this.query(
      this.db
        .from("opportunities")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
    );
  }

  createOpportunity(
    opp: Partial<Opportunity> & { client_id: string; description: string }
  ): Promise<Opportunity> {
    return this.query(this.db.from("opportunities").insert(opp).select().single());
  }

  updateOpportunity(id: string, patch: Partial<Opportunity>): Promise<Opportunity> {
    return this.query(
      this.db.from("opportunities").update(patch).eq("id", id).select().single()
    );
  }

  escalations(clientId: string): Promise<Escalation[]> {
    return this.query(
      this.db
        .from("escalations")
        .select("*, profiles ( full_name )")
        .eq("client_id", clientId)
        .order("opened_at", { ascending: false })
    );
  }

  openEscalation(
    clientId: string,
    severity: string,
    summary: string,
    ownerId: string
  ): Promise<Escalation> {
    return this.query(
      this.db
        .from("escalations")
        .insert({ client_id: clientId, severity, summary, owner_id: ownerId })
        .select()
        .single()
    );
  }

  resolveEscalation(id: string, resolution: string): Promise<Escalation> {
    return this.query(
      this.db
        .from("escalations")
        .update({ resolved_at: new Date().toISOString(), resolution })
        .eq("id", id)
        .select()
        .single()
    );
  }

  feedback(clientId: string): Promise<FeedbackPulse[]> {
    return this.query(
      this.db
        .from("feedback_pulses")
        .select("*, projects ( name )")
        .eq("client_id", clientId)
        .order("at", { ascending: false })
    );
  }

  recordFeedback(pulse: {
    client_id: string;
    project_id: string | null;
    score_1_5: number;
    comment?: string;
    actor_id: string;
  }): Promise<FeedbackPulse> {
    return this.query(
      this.db.from("feedback_pulses").insert(pulse).select().single()
    );
  }
}
