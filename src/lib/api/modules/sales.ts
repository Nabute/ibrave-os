import { BaseRepository } from "../base";
import type { WorkflowActions } from "../hateoas";
import type {
  Contract,
  Lead,
  LeadActivity,
  PipelineStageReport,
  Quote,
  QuoteLine,
  WinHandoffResult,
} from "../types";

/** Sales pipeline, quotes & contracts (Module A §3b). */
export class SalesRepository extends BaseRepository {
  leads(): Promise<Lead[]> {
    return this.query(
      this.db
        .from("leads")
        .select("*, profiles!leads_owner_id_fkey ( full_name )")
        .order("created_at", { ascending: false })
    );
  }

  createLead(lead: Partial<Lead> & { company: string }): Promise<Lead> {
    return this.query(this.db.from("leads").insert(lead).select().single());
  }

  updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
    return this.query(this.db.from("leads").update(patch).eq("id", id).select().single());
  }

  activities(leadId: string): Promise<LeadActivity[]> {
    return this.query(
      this.db
        .from("lead_activities")
        .select("*, profiles ( full_name )")
        .eq("lead_id", leadId)
        .order("at", { ascending: false })
    );
  }

  logActivity(leadId: string, kind: string, body: string, actorId: string): Promise<LeadActivity> {
    return this.query(
      this.db
        .from("lead_activities")
        .insert({ lead_id: leadId, kind, body, actor_id: actorId })
        .select()
        .single()
    );
  }

  // -- workflow --------------------------------------------------------------

  leadActions(leadId: string): Promise<WorkflowActions> {
    return this.rpc("lead_actions", { p_lead_id: leadId });
  }

  advanceLead(leadId: string, action: string, comment?: string): Promise<Lead> {
    return this.rpc("advance_lead", {
      p_lead_id: leadId,
      p_action: action,
      p_comment: comment ?? null,
    });
  }

  winLead(
    leadId: string,
    options: {
      client_id?: string | null;
      project_name: string;
      billing_model: string;
      contract_end_date?: string | null;
      staffing?: {
        role_title: string;
        allocation_pct: number;
        skills: string[];
        duration_weeks: number | null;
      } | null;
    }
  ): Promise<WinHandoffResult> {
    return this.rpc("win_lead", { p_lead_id: leadId, p_options: options });
  }

  // -- quotes ----------------------------------------------------------------

  quotes(leadId: string): Promise<Quote[]> {
    return this.query(
      this.db
        .from("quotes")
        .select("*, quote_lines ( * )")
        .eq("lead_id", leadId)
        .order("version", { ascending: false })
    );
  }

  createQuote(leadId: string): Promise<Quote> {
    return this.rpc("create_quote", { p_lead_id: leadId });
  }

  createRevision(quoteId: string): Promise<Quote> {
    return this.rpc("create_quote_revision", { p_quote_id: quoteId });
  }

  quoteAction(quoteId: string, action: string, comment?: string): Promise<Quote> {
    return this.rpc("quote_action", {
      p_quote_id: quoteId,
      p_action: action,
      p_comment: comment ?? null,
    });
  }

  quoteActions(quoteId: string): Promise<WorkflowActions> {
    return this.rpc("quote_actions", { p_quote_id: quoteId });
  }

  addQuoteLine(line: {
    quote_id: string;
    description: string;
    role_title?: string | null;
    qty_hours?: number | null;
    unit_price_minor: number;
    amount_minor: number;
    position: number;
  }): Promise<QuoteLine> {
    return this.query(this.db.from("quote_lines").insert(line).select().single());
  }

  deleteQuoteLine(lineId: string): Promise<null> {
    return this.query(this.db.from("quote_lines").delete().eq("id", lineId));
  }

  // -- contracts & reporting -------------------------------------------------

  contracts(): Promise<Contract[]> {
    return this.query(
      this.db
        .from("contracts")
        .select("*, clients ( id, name )")
        .order("end_date", { ascending: true, nullsFirst: false })
    );
  }

  pipelineReport(): Promise<PipelineStageReport[]> {
    return this.query(this.db.from("v_pipeline_report").select("*"));
  }
}
