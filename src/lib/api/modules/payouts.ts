import { BaseRepository } from "../base";
import type { WorkflowActions } from "../hateoas";
import type {
  CostRate,
  MarginRow,
  PayoutStatement,
  ReconciliationRow,
} from "../types";

/**
 * Payouts & margin (Module E). Statements are computed from the same approved
 * hours invoices bill from; state changes go through the FSM RPCs.
 */
export class PayoutsRepository extends BaseRepository {
  list(): Promise<PayoutStatement[]> {
    return this.query(
      this.db
        .from("payout_statements")
        .select(
          "*, profiles!payout_statements_user_id_fkey ( id, full_name, employment_type )"
        )
        .order("created_at", { ascending: false })
    );
  }

  get(id: string): Promise<PayoutStatement> {
    return this.query(
      this.db
        .from("payout_statements")
        .select(
          "*, profiles!payout_statements_user_id_fkey ( id, full_name, employment_type ), payout_lines ( *, projects ( id, name ) )"
        )
        .eq("id", id)
        .single()
    );
  }

  // -- workflow actions ------------------------------------------------------

  generate(periodStart: string, periodEnd: string): Promise<PayoutStatement[]> {
    return this.rpc("generate_payout_statements", {
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
  }

  confirm(statementId: string): Promise<PayoutStatement> {
    return this.rpc("confirm_payout_statement", { p_statement_id: statementId });
  }

  markPaid(statementId: string): Promise<PayoutStatement> {
    return this.rpc("mark_payout_paid", { p_statement_id: statementId });
  }

  actions(statementId: string): Promise<WorkflowActions> {
    return this.rpc("payout_statement_actions", { p_statement_id: statementId });
  }

  deleteDraft(statementId: string): Promise<null> {
    return this.query(
      this.db.from("payout_statements").delete().eq("id", statementId)
    );
  }

  // -- cost rates & reporting -----------------------------------------------

  costRates(): Promise<CostRate[]> {
    return this.query(
      this.db
        .from("cost_rates")
        .select("*, profiles ( full_name )")
        .order("effective_from", { ascending: false })
    );
  }

  saveCostRate(rate: {
    user_id: string;
    effective_from: string;
    hourly_cost_minor?: number | null;
    monthly_cost_minor?: number | null;
    currency?: string;
    note?: string;
  }): Promise<CostRate> {
    return this.query(this.db.from("cost_rates").insert(rate).select().single());
  }

  reconciliation(): Promise<ReconciliationRow[]> {
    return this.query(
      this.db
        .from("v_payout_reconciliation")
        .select("*")
        .order("month", { ascending: false })
        .order("full_name")
    );
  }

  margin(): Promise<MarginRow[]> {
    return this.query(
      this.db
        .from("v_margin_by_project")
        .select("*")
        .order("month", { ascending: false })
        .order("project_name")
    );
  }
}
