/**
 * Backend DTOs — mirror of the Supabase schema (see supabase/migrations).
 * Money is integer minor units (cents) + currency; never floats.
 * `src/types/database.ts` (generated) is the machine-checked source of truth;
 * these interfaces are the app-facing subset with joins spelled out.
 */

export type AppRole =
  | "employee"
  | "pm"
  | "finance"
  | "recruiter"
  | "resourcing"
  | "sales"
  | "account_owner"
  | "owner"
  | "admin";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  title: string | null;
  employment_type: "employee" | "contractor";
  weekly_capacity_hours: number;
  active: boolean;
}

export interface CompanySettings {
  company_name: string;
  legal_name: string | null;
  address: string | null;
  company_timezone: string;
  base_currency: string;
  invoice_prefix: string;
  credit_note_prefix: string;
  default_payment_terms_days: number;
  default_tax_rate_pct: number;
  bank_details: string | null;
}

export interface Client {
  id: string;
  name: string;
  legal_name: string | null;
  billing_address: string | null;
  contact_email: string | null;
  currency: string;
  payment_terms_days: number;
  tax_rate_pct: number;
  invoice_grouping: "project" | "person" | "role" | "detailed";
  timesheet_appendix: boolean;
  notes: string | null;
  active: boolean;
}

export interface Contact {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_role: "billing" | "technical" | "decision_maker" | "champion" | "general";
  opted_out: boolean;
}

export type ProjectStatus = "active" | "paused" | "closed";
export type BillingModel = "tm" | "retainer" | "fixed";

export interface Project {
  id: string;
  client_id: string;
  name: string;
  code: string | null;
  status: ProjectStatus;
  billing_model: BillingModel;
  retainer_fee_minor: number | null;
  retainer_included_hours: number | null;
  retainer_overage_rate_minor: number | null;
  budget_hours: number | null;
  pm_id: string | null;
  clients?: Pick<Client, "id" | "name" | "currency">;
}

export interface Task {
  id: string;
  project_id: string;
  name: string;
  billable: boolean;
  status: "open" | "closed";
}

export interface Assignment {
  id: string;
  user_id: string;
  project_id: string;
  role_on_project: string | null;
  start_date: string;
  end_date: string | null;
  allocation_pct: number;
  projects?: Pick<Project, "id" | "name" | "status" | "client_id"> & {
    clients?: Pick<Client, "name">;
  };
  profiles?: Pick<Profile, "id" | "full_name">;
}

export type EntryStatus = "draft" | "submitted" | "approved";

export interface TimeEntry {
  id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  work_date: string; // plain date, company timezone
  hours: number;
  note: string | null;
  billable: boolean;
  status: EntryStatus;
  rejection_comment: string | null;
  approved_by: string | null;
  approved_at: string | null;
  invoice_id: string | null;
  adjusts_entry_id: string | null;
}

export interface ApprovalQueueRow {
  id: string;
  user_id: string;
  full_name: string;
  project_id: string;
  project_name: string;
  task_name: string | null;
  work_date: string;
  week_start: string;
  hours: number;
  note: string | null;
  billable: boolean;
  created_at: string;
}

export interface RateCard {
  id: string;
  project_id: string | null;
  client_id: string | null;
  effective_from: string;
  note: string | null;
  rate_card_lines?: RateCardLine[];
}

export interface RateCardLine {
  id: string;
  rate_card_id: string;
  user_id: string | null;
  role_name: string | null;
  hourly_rate_minor: number;
  profiles?: Pick<Profile, "full_name">;
}

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "void";

export interface Invoice {
  id: string;
  kind: "invoice" | "credit_note";
  client_id: string;
  number: string | null;
  period_start: string | null;
  period_end: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotal_minor: number;
  tax_total_minor: number;
  total_minor: number;
  issued_at: string | null;
  due_date: string | null;
  void_reason: string | null;
  credits_invoice_id: string | null;
  dunning_paused: boolean;
  notes: string | null;
  created_at: string;
  clients?: Pick<Client, "id" | "name" | "billing_address" | "contact_email">;
  invoice_lines?: InvoiceLine[];
  payments?: Payment[];
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  kind: "time" | "retainer" | "overage" | "milestone" | "manual";
  description: string;
  quantity: number;
  unit_price_minor: number;
  amount_minor: number;
  tax_rate_pct: number;
  group_key: string | null;
  position: number;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount_minor: number;
  paid_at: string;
  method: string | null;
  note: string | null;
}

export interface UnbilledRow {
  client_id: string;
  client_name: string;
  currency: string;
  project_id: string;
  project_name: string;
  oldest_entry: string;
  hours: number;
  value_minor: number;
}

export interface AgingRow {
  id: string;
  number: string;
  client_name: string;
  currency: string;
  total_minor: number;
  outstanding_minor: number;
  due_date: string;
  status: InvoiceStatus;
  days_overdue: number;
  bucket: "current" | "0-30" | "31-60" | "61-90" | "90+";
}

export interface UtilizationRow {
  user_id: string;
  full_name: string;
  month: string;
  billable_hours: number | null;
  total_hours: number;
  billable_pct: number | null;
}

export interface BurnRow {
  project_id: string;
  project_name: string;
  client_name: string;
  budget_hours: number | null;
  retainer_included_hours: number | null;
  approved_hours: number;
  logged_hours: number;
  burn_pct: number | null;
}

export type LeadStage =
  | "lead"
  | "qualified"
  | "proposal_sent"
  | "negotiation"
  | "won"
  | "lost";

export interface Lead {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  stage: LeadStage;
  expected_value_minor: number | null;
  currency: string;
  probability_pct: number;
  expected_start: string | null;
  owner_id: string | null;
  client_id: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  profiles?: { full_name: string };
}

export interface LeadActivity {
  id: number;
  lead_id: string;
  kind: string;
  body: string;
  actor_id: string | null;
  at: string;
  profiles?: { full_name: string };
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "superseded";

export interface Quote {
  id: string;
  lead_id: string;
  version: number;
  status: QuoteStatus;
  currency: string;
  valid_until: string | null;
  total_minor: number;
  notes: string | null;
  created_at: string;
  quote_lines?: QuoteLine[];
}

export interface QuoteLine {
  id: string;
  quote_id: string;
  description: string;
  role_title: string | null;
  qty_hours: number | null;
  unit_price_minor: number;
  amount_minor: number;
  billing_model_hint: BillingModel | null;
  position: number;
}

export interface Contract {
  id: string;
  client_id: string;
  lead_id: string | null;
  quote_id: string | null;
  start_date: string;
  end_date: string | null;
  notice_days: number;
  payment_terms_days: number;
  billing_schedule: string;
  status: "active" | "expired" | "terminated";
  signed_doc_ref: string | null;
  notes: string | null;
  clients?: { id: string; name: string };
}

export interface PipelineStageReport {
  stage: LeadStage;
  deal_count: number;
  total_value_minor: number | null;
  weighted_value_minor: number | null;
}

export interface WinHandoffResult {
  client_id: string;
  contract_id: string;
  project_id: string;
  staffing_request_id: string | null;
}

export type SkillLevel = "junior" | "mid" | "senior";

export interface Skill {
  id: string;
  name: string;
}

export interface PersonSkill {
  user_id: string;
  skill_id: string;
  level: SkillLevel;
  skills?: { name: string };
  profiles?: { full_name: string };
}

export interface StaffingRequest {
  id: string;
  project_id: string | null;
  role_title: string;
  skills: string[];
  seniority: SkillLevel | null;
  allocation_pct: number;
  start_date: string;
  duration_weeks: number | null;
  status: "open" | "filled" | "cancelled";
  filled_by_assignment: string | null;
  notes: string | null;
  created_at: string;
  projects?: { id: string; name: string };
}

export interface CandidateSuggestion {
  user_id: string;
  full_name: string;
  title: string | null;
  matched_skills: string[];
  skill_match_count: number;
  committed_allocation_pct: number;
  available_pct: number;
  score: number;
}

export interface BenchRow {
  user_id: string;
  full_name: string;
  title: string | null;
  employment_type: "employee" | "contractor";
  weekly_capacity_hours: number;
  committed_allocation_pct: number;
  bench_pct: number;
  under_allocated: boolean;
  skills: string[];
  time_off_days: number;
  weekly_bench_cost_minor: number | null;
}

export interface CapacityMonth {
  month: string;
  capacity_hours: number;
  committed_hours: number;
  time_off_hours: number;
  free_hours: number;
  utilization_pct: number;
}

export interface TimeOff {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  kind: string;
  note: string | null;
  profiles?: { full_name: string };
}

export type PayoutStatus = "draft" | "confirmed" | "paid";

export interface PayoutStatement {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  currency: string;
  status: PayoutStatus;
  total_minor: number;
  confirmed_at: string | null;
  paid_at: string | null;
  note: string | null;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "employment_type">;
  payout_lines?: PayoutLine[];
}

export interface PayoutLine {
  id: string;
  statement_id: string;
  project_id: string;
  hours: number;
  rate_minor: number;
  amount_minor: number;
  projects?: Pick<Project, "id" | "name">;
}

export interface CostRate {
  id: string;
  user_id: string;
  effective_from: string;
  hourly_cost_minor: number | null;
  monthly_cost_minor: number | null;
  currency: string;
  note: string | null;
  profiles?: Pick<Profile, "full_name">;
}

export interface ReconciliationRow {
  user_id: string;
  full_name: string;
  month: string;
  approved_hours: number;
  billed_hours: number | null;
  paid_out_hours: number;
  unpaid_hours: number;
  missing_cost_rate: boolean;
}

export interface MarginRow {
  project_id: string;
  project_name: string;
  client_id: string;
  client_name: string;
  currency: string;
  month: string;
  approved_hours: number;
  revenue_minor: number;
  cost_minor: number;
  margin_minor: number;
  margin_pct: number | null;
}

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface MyDay {
  timesheet?: {
    week_start: string;
    draft_hours: number;
    submitted_hours: number;
    approved_hours: number;
    rejected_count: number;
  };
  approvals?: {
    pending_count: number;
    people: number;
    oldest_submission: string | null;
  };
  finance?: {
    draft_invoices: number;
    overdue_invoices: number;
    overdue_minor: number;
    unbilled_minor: number;
    payouts_to_confirm: number;
  };
  pulse?: {
    unsubmitted_people: number;
    issued_this_month_minor: number;
    collected_this_month_minor: number;
    margin_this_month_minor: number;
  };
}

export interface WorkflowHistoryRow {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  from_state: string;
  to_state: string;
  actor_id: string | null;
  comment: string | null;
  at: string;
}
