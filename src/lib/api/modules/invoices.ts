import { BaseRepository } from "../base";
import type { WorkflowActions } from "../hateoas";
import type { Invoice, InvoiceLine, WorkflowHistoryRow } from "../types";

/**
 * Invoice workspace (spec §3.3). Every state change is an atomic Postgres RPC
 * behind the FSM guard; drafts' manual lines are the only direct writes.
 */
export class InvoicesRepository extends BaseRepository {
  list(): Promise<Invoice[]> {
    return this.query(
      this.db
        .from("invoices")
        .select("*, clients ( id, name )")
        .order("created_at", { ascending: false })
    );
  }

  get(id: string): Promise<Invoice> {
    return this.query(
      this.db
        .from("invoices")
        .select(
          "*, clients ( id, name, legal_name, billing_address, contact_email, org_no, vat_no, payment_terms_days ), invoice_lines ( * ), payments ( * )"
        )
        .eq("id", id)
        .order("position", { referencedTable: "invoice_lines" })
        .single()
    );
  }

  // -- workflow actions ------------------------------------------------------

  generateDraft(clientId: string, periodStart: string, periodEnd: string): Promise<Invoice> {
    return this.rpc("generate_draft_invoice", {
      p_client_id: clientId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
  }

  issue(invoiceId: string): Promise<Invoice> {
    return this.rpc("issue_invoice", { p_invoice_id: invoiceId });
  }

  voidInvoice(invoiceId: string, reason: string): Promise<Invoice> {
    return this.rpc("void_invoice", { p_invoice_id: invoiceId, p_reason: reason });
  }

  createCreditNote(
    invoiceId: string,
    amountMinor: number,
    description: string
  ): Promise<Invoice> {
    return this.rpc("create_credit_note", {
      p_invoice_id: invoiceId,
      p_amount_minor: amountMinor,
      p_description: description,
    });
  }

  recordPayment(
    invoiceId: string,
    amountMinor: number,
    paidAt: string,
    method?: string,
    note?: string
  ): Promise<Invoice> {
    return this.rpc("record_payment", {
      p_invoice_id: invoiceId,
      p_amount_minor: amountMinor,
      p_paid_at: paidAt,
      p_method: method ?? null,
      p_note: note ?? null,
    });
  }

  deleteDraft(invoiceId: string): Promise<null> {
    return this.rpc("delete_draft_invoice", { p_invoice_id: invoiceId });
  }

  /** HATEOAS: buttons for the invoice detail screen. */
  actions(invoiceId: string): Promise<WorkflowActions> {
    return this.rpc("invoice_actions", { p_invoice_id: invoiceId });
  }

  history(invoiceId: string): Promise<WorkflowHistoryRow[]> {
    return this.query(
      this.db
        .from("workflow_history")
        .select("*")
        .eq("entity_type", "invoice")
        .eq("entity_id", invoiceId)
        .order("at", { ascending: false })
    );
  }

  // -- draft editing (manual lines, FR-16) ----------------------------------

  addManualLine(line: {
    invoice_id: string;
    description: string;
    quantity: number;
    unit_price_minor: number;
    amount_minor: number;
    tax_rate_pct: number;
    position: number;
  }): Promise<InvoiceLine> {
    return this.query(
      this.db
        .from("invoice_lines")
        .insert({ ...line, kind: "manual" })
        .select()
        .single()
    );
  }

  deleteLine(lineId: string): Promise<null> {
    return this.query(this.db.from("invoice_lines").delete().eq("id", lineId));
  }

  toggleDunning(invoiceId: string, paused: boolean): Promise<Invoice> {
    return this.query(
      this.db
        .from("invoices")
        .update({ dunning_paused: paused })
        .eq("id", invoiceId)
        .select()
        .single()
    );
  }
}
