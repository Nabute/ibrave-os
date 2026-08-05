export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_feed: {
        Row: {
          actor_id: string | null
          at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: number
          summary: string
        }
        Insert: {
          actor_id?: string | null
          at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: never
          summary: string
        }
        Update: {
          actor_id?: string | null
          at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: never
          summary?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          allocation_pct: number
          created_at: string
          end_date: string | null
          id: string
          project_id: string
          role_on_project: string | null
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allocation_pct?: number
          created_at?: string
          end_date?: string | null
          id?: string
          project_id: string
          role_on_project?: string | null
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allocation_pct?: number
          created_at?: string
          end_date?: string | null
          id?: string
          project_id?: string
          role_on_project?: string | null
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_burn"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          diff: Json | null
          entity_id: string
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity_id: string
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity_id?: string
          entity_type?: string
          id?: never
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          detail: Json | null
          id: number
          job: string
          ran_at: string
          run_key: string
          status: string
        }
        Insert: {
          detail?: Json | null
          id?: never
          job: string
          ran_at?: string
          run_key: string
          status?: string
        }
        Update: {
          detail?: Json | null
          id?: never
          job?: string
          ran_at?: string
          run_key?: string
          status?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          active: boolean
          billing_address: string | null
          contact_email: string | null
          created_at: string
          currency: string
          id: string
          invoice_grouping: Database["public"]["Enums"]["invoice_grouping"]
          legal_name: string | null
          name: string
          notes: string | null
          payment_terms_days: number
          tax_rate_pct: number
          timesheet_appendix: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_address?: string | null
          contact_email?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_grouping?: Database["public"]["Enums"]["invoice_grouping"]
          legal_name?: string | null
          name: string
          notes?: string | null
          payment_terms_days?: number
          tax_rate_pct?: number
          timesheet_appendix?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_address?: string | null
          contact_email?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_grouping?: Database["public"]["Enums"]["invoice_grouping"]
          legal_name?: string | null
          name?: string
          notes?: string | null
          payment_terms_days?: number
          tax_rate_pct?: number
          timesheet_appendix?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          approval_nudge_days: number
          bank_details: string | null
          base_currency: string
          company_name: string
          company_timezone: string
          created_at: string
          credit_note_prefix: string
          default_payment_terms_days: number
          default_tax_rate_pct: number
          id: boolean
          invoice_prefix: string
          legal_name: string | null
          logo_url: string | null
          stale_entry_days: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          approval_nudge_days?: number
          bank_details?: string | null
          base_currency?: string
          company_name?: string
          company_timezone?: string
          created_at?: string
          credit_note_prefix?: string
          default_payment_terms_days?: number
          default_tax_rate_pct?: number
          id?: boolean
          invoice_prefix?: string
          legal_name?: string | null
          logo_url?: string | null
          stale_entry_days?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          approval_nudge_days?: number
          bank_details?: string | null
          base_currency?: string
          company_name?: string
          company_timezone?: string
          created_at?: string
          credit_note_prefix?: string
          default_payment_terms_days?: number
          default_tax_rate_pct?: number
          id?: boolean
          invoice_prefix?: string
          legal_name?: string | null
          logo_url?: string | null
          stale_entry_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          client_id: string
          contact_role: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          opted_out: boolean
          phone: string | null
          preferred_channel: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_role?: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          opted_out?: boolean
          phone?: string | null
          preferred_channel?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_role?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          opted_out?: boolean
          phone?: string | null
          preferred_channel?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["client_id"]
          },
        ]
      }
      cost_rates: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          hourly_cost_minor: number | null
          id: string
          monthly_cost_minor: number | null
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from: string
          hourly_cost_minor?: number | null
          id?: string
          monthly_cost_minor?: number | null
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          hourly_cost_minor?: number | null
          id?: string
          monthly_cost_minor?: number | null
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_rates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_rates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          kind: Database["public"]["Enums"]["invoice_kind"]
          last_value: number
          year: number
        }
        Insert: {
          kind: Database["public"]["Enums"]["invoice_kind"]
          last_value?: number
          year: number
        }
        Update: {
          kind?: Database["public"]["Enums"]["invoice_kind"]
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      invoice_line_entries: {
        Row: {
          invoice_line_id: string
          time_entry_id: string
        }
        Insert: {
          invoice_line_id: string
          time_entry_id: string
        }
        Update: {
          invoice_line_id?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_entries_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_entries_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_entries_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "v_approval_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount_minor: number
          description: string
          group_key: string | null
          id: string
          invoice_id: string
          kind: string
          position: number
          quantity: number
          tax_rate_pct: number
          unit_price_minor: number
        }
        Insert: {
          amount_minor: number
          description: string
          group_key?: string | null
          id?: string
          invoice_id: string
          kind: string
          position?: number
          quantity?: number
          tax_rate_pct?: number
          unit_price_minor: number
        }
        Update: {
          amount_minor?: number
          description?: string
          group_key?: string | null
          id?: string
          invoice_id?: string
          kind?: string
          position?: number
          quantity?: number
          tax_rate_pct?: number
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          credits_invoice_id: string | null
          currency: string
          due_date: string | null
          dunning_paused: boolean
          id: string
          issued_at: string | null
          issued_by: string | null
          kind: Database["public"]["Enums"]["invoice_kind"]
          notes: string | null
          number: string | null
          period_end: string | null
          period_start: string | null
          status: string
          subtotal_minor: number
          tax_total_minor: number
          total_minor: number
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          credits_invoice_id?: string | null
          currency: string
          due_date?: string | null
          dunning_paused?: boolean
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          kind?: Database["public"]["Enums"]["invoice_kind"]
          notes?: string | null
          number?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          subtotal_minor?: number
          tax_total_minor?: number
          total_minor?: number
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          credits_invoice_id?: string | null
          currency?: string
          due_date?: string | null
          dunning_paused?: boolean
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          kind?: Database["public"]["Enums"]["invoice_kind"]
          notes?: string | null
          number?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          subtotal_minor?: number
          tax_total_minor?: number
          total_minor?: number
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_credits_invoice_id_fkey"
            columns: ["credits_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_credits_invoice_id_fkey"
            columns: ["credits_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      milestones: {
        Row: {
          amount_minor: number
          created_at: string
          id: string
          invoice_id: string | null
          name: string
          project_id: string
          ready_to_bill: boolean
          updated_at: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          name: string
          project_id: string
          ready_to_bill?: boolean
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          name?: string
          project_id?: string
          ready_to_bill?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_burn"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["project_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: number
          kind: string
          link: string | null
          payload: Json | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: never
          kind: string
          link?: string | null
          payload?: Json | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: never
          kind?: string
          link?: string | null
          payload?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          id: string
          invoice_id: string
          method: string | null
          note: string | null
          paid_at: string
          recorded_by: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          id?: string
          invoice_id: string
          method?: string | null
          note?: string | null
          paid_at?: string
          recorded_by?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payout_line_entries: {
        Row: {
          payout_line_id: string
          time_entry_id: string
        }
        Insert: {
          payout_line_id: string
          time_entry_id: string
        }
        Update: {
          payout_line_id?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_line_entries_payout_line_id_fkey"
            columns: ["payout_line_id"]
            isOneToOne: false
            referencedRelation: "payout_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_line_entries_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_line_entries_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "v_approval_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_lines: {
        Row: {
          amount_minor: number
          hours: number
          id: string
          project_id: string
          rate_minor: number
          statement_id: string
        }
        Insert: {
          amount_minor: number
          hours: number
          id?: string
          project_id: string
          rate_minor: number
          statement_id: string
        }
        Update: {
          amount_minor?: number
          hours?: number
          id?: string
          project_id?: string
          rate_minor?: number
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "payout_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_burn"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "payout_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "payout_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "payout_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_statements: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          id: string
          note: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          total_minor: number
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          total_minor?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          total_minor?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_statements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_statements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_statements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_statements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      person_skills: {
        Row: {
          level: Database["public"]["Enums"]["skill_level"]
          skill_id: string
          user_id: string
        }
        Insert: {
          level?: Database["public"]["Enums"]["skill_level"]
          skill_id: string
          user_id: string
        }
        Update: {
          level?: Database["public"]["Enums"]["skill_level"]
          skill_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          full_name: string
          id: string
          timezone: string | null
          title: string | null
          updated_at: string
          weekly_capacity_hours: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name: string
          id: string
          timezone?: string | null
          title?: string | null
          updated_at?: string
          weekly_capacity_hours?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name?: string
          id?: string
          timezone?: string | null
          title?: string | null
          updated_at?: string
          weekly_capacity_hours?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          billing_model: Database["public"]["Enums"]["billing_model"]
          budget_hours: number | null
          client_id: string
          code: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          pm_id: string | null
          retainer_fee_minor: number | null
          retainer_included_hours: number | null
          retainer_overage_rate_minor: number | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          billing_model?: Database["public"]["Enums"]["billing_model"]
          budget_hours?: number | null
          client_id: string
          code?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          pm_id?: string | null
          retainer_fee_minor?: number | null
          retainer_included_hours?: number | null
          retainer_overage_rate_minor?: number | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          billing_model?: Database["public"]["Enums"]["billing_model"]
          budget_hours?: number | null
          client_id?: string
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          pm_id?: string | null
          retainer_fee_minor?: number | null
          retainer_included_hours?: number | null
          retainer_overage_rate_minor?: number | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "projects_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      rate_card_lines: {
        Row: {
          hourly_rate_minor: number
          id: string
          rate_card_id: string
          role_name: string | null
          user_id: string | null
        }
        Insert: {
          hourly_rate_minor: number
          id?: string
          rate_card_id: string
          role_name?: string | null
          user_id?: string | null
        }
        Update: {
          hourly_rate_minor?: number
          id?: string
          rate_card_id?: string
          role_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_card_lines_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "rate_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_card_lines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_card_lines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      rate_cards: {
        Row: {
          client_id: string | null
          created_at: string
          effective_from: string
          id: string
          note: string | null
          project_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          effective_from: string
          id?: string
          note?: string | null
          project_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          effective_from?: string
          id?: string
          note?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "rate_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "rate_cards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_cards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "rate_cards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_burn"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "rate_cards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["project_id"]
          },
        ]
      }
      skills: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      staffing_requests: {
        Row: {
          allocation_pct: number
          created_at: string
          created_by: string | null
          duration_weeks: number | null
          filled_by_assignment: string | null
          id: string
          notes: string | null
          project_id: string | null
          role_title: string
          seniority: Database["public"]["Enums"]["skill_level"] | null
          skills: string[]
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          allocation_pct?: number
          created_at?: string
          created_by?: string | null
          duration_weeks?: number | null
          filled_by_assignment?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          role_title: string
          seniority?: Database["public"]["Enums"]["skill_level"] | null
          skills?: string[]
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          allocation_pct?: number
          created_at?: string
          created_by?: string | null
          duration_weeks?: number | null
          filled_by_assignment?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          role_title?: string
          seniority?: Database["public"]["Enums"]["skill_level"] | null
          skills?: string[]
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staffing_requests_filled_by_assignment_fkey"
            columns: ["filled_by_assignment"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "staffing_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_burn"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "staffing_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["project_id"]
          },
        ]
      }
      tasks: {
        Row: {
          billable: boolean
          created_at: string
          id: string
          name: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          billable?: boolean
          created_at?: string
          id?: string
          name: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          billable?: boolean
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_burn"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["project_id"]
          },
        ]
      }
      time_entries: {
        Row: {
          adjusts_entry_id: string | null
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          created_at: string
          hours: number
          id: string
          invoice_id: string | null
          note: string | null
          project_id: string
          rejection_comment: string | null
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          adjusts_entry_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean
          created_at?: string
          hours: number
          id?: string
          invoice_id?: string | null
          note?: string | null
          project_id: string
          rejection_comment?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          adjusts_entry_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean
          created_at?: string
          hours?: number
          id?: string
          invoice_id?: string | null
          note?: string | null
          project_id?: string
          rejection_comment?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_adjusts_entry_id_fkey"
            columns: ["adjusts_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_adjusts_entry_id_fkey"
            columns: ["adjusts_entry_id"]
            isOneToOne: false
            referencedRelation: "v_approval_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_entries_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_burn"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      time_off: {
        Row: {
          created_at: string
          end_date: string
          id: string
          kind: string
          note: string | null
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          kind?: string
          note?: string | null
          start_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          kind?: string
          note?: string | null
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_history: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          comment: string | null
          entity_id: string
          entity_type: string
          from_state: string
          id: number
          to_state: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          comment?: string | null
          entity_id: string
          entity_type: string
          from_state: string
          id?: never
          to_state: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          comment?: string | null
          entity_id?: string
          entity_type?: string
          from_state?: string
          id?: never
          to_state?: string
        }
        Relationships: []
      }
      workflow_transitions: {
        Row: {
          action: string
          entity_type: string
          from_state: string
          is_destructive: boolean
          label: string
          required_role: Database["public"]["Enums"]["app_role"]
          requires_comment: boolean
          sort_order: number
          to_state: string
        }
        Insert: {
          action: string
          entity_type: string
          from_state: string
          is_destructive?: boolean
          label: string
          required_role: Database["public"]["Enums"]["app_role"]
          requires_comment?: boolean
          sort_order?: number
          to_state: string
        }
        Update: {
          action?: string
          entity_type?: string
          from_state?: string
          is_destructive?: boolean
          label?: string
          required_role?: Database["public"]["Enums"]["app_role"]
          requires_comment?: boolean
          sort_order?: number
          to_state?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_approval_queue: {
        Row: {
          billable: boolean | null
          created_at: string | null
          full_name: string | null
          hours: number | null
          id: string | null
          note: string | null
          pm_id: string | null
          project_id: string | null
          project_name: string | null
          status: string | null
          task_id: string | null
          task_name: string | null
          user_id: string | null
          week_start: string | null
          work_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_burn"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
      v_invoice_aging: {
        Row: {
          bucket: string | null
          client_id: string | null
          client_name: string | null
          currency: string | null
          days_overdue: number | null
          due_date: string | null
          id: string | null
          issued_at: string | null
          number: string | null
          outstanding_minor: number | null
          status: string | null
          total_minor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_margin_by_project: {
        Row: {
          approved_hours: number | null
          client_id: string | null
          client_name: string | null
          cost_minor: number | null
          currency: string | null
          margin_minor: number | null
          margin_pct: number | null
          month: string | null
          project_id: string | null
          project_name: string | null
          revenue_minor: number | null
        }
        Relationships: []
      }
      v_payout_reconciliation: {
        Row: {
          approved_hours: number | null
          billed_hours: number | null
          full_name: string | null
          missing_cost_rate: boolean | null
          month: string | null
          paid_out_hours: number | null
          unpaid_hours: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_project_burn: {
        Row: {
          approved_hours: number | null
          budget_hours: number | null
          burn_pct: number | null
          client_id: string | null
          client_name: string | null
          logged_hours: number | null
          project_id: string | null
          project_name: string | null
          retainer_included_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_margin_by_project"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_unbilled_work"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_unbilled_work: {
        Row: {
          client_id: string | null
          client_name: string | null
          currency: string | null
          hours: number | null
          oldest_entry: string | null
          project_id: string | null
          project_name: string | null
          value_minor: number | null
        }
        Relationships: []
      }
      v_utilization: {
        Row: {
          billable_hours: number | null
          billable_pct: number | null
          full_name: string | null
          month: string | null
          total_hours: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_payout_reconciliation"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      approve_entries: {
        Args: { p_entry_ids: string[] }
        Returns: {
          adjusts_entry_id: string | null
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          created_at: string
          hours: number
          id: string
          invoice_id: string | null
          note: string | null
          project_id: string
          rejection_comment: string | null
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
          work_date: string
        }[]
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      bench: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          bench_pct: number
          committed_allocation_pct: number
          employment_type: Database["public"]["Enums"]["employment_type"]
          full_name: string
          skills: string[]
          time_off_days: number
          title: string
          under_allocated: boolean
          user_id: string
          weekly_bench_cost_minor: number
          weekly_capacity_hours: number
        }[]
      }
      cancel_staffing_request: {
        Args: { p_comment: string; p_request_id: string }
        Returns: {
          allocation_pct: number
          created_at: string
          created_by: string | null
          duration_weeks: number | null
          filled_by_assignment: string | null
          id: string
          notes: string | null
          project_id: string | null
          role_title: string
          seniority: Database["public"]["Enums"]["skill_level"] | null
          skills: string[]
          start_date: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "staffing_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      capacity_forecast: {
        Args: { p_months?: number }
        Returns: {
          capacity_hours: number
          committed_hours: number
          free_hours: number
          month: string
          time_off_hours: number
          utilization_pct: number
        }[]
      }
      confirm_payout_statement: {
        Args: { p_statement_id: string }
        Returns: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          id: string
          note: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          total_minor: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payout_statements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      copy_previous_week: {
        Args: { p_week_start: string }
        Returns: {
          adjusts_entry_id: string | null
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          created_at: string
          hours: number
          id: string
          invoice_id: string | null
          note: string | null
          project_id: string
          rejection_comment: string | null
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
          work_date: string
        }[]
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_adjustment: {
        Args: { p_entry_id: string; p_hours: number; p_note: string }
        Returns: {
          adjusts_entry_id: string | null
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          created_at: string
          hours: number
          id: string
          invoice_id: string | null
          note: string | null
          project_id: string
          rejection_comment: string | null
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_credit_note: {
        Args: {
          p_amount_minor: number
          p_description: string
          p_invoice_id: string
        }
        Returns: {
          client_id: string
          created_at: string
          credits_invoice_id: string | null
          currency: string
          due_date: string | null
          dunning_paused: boolean
          id: string
          issued_at: string | null
          issued_by: string | null
          kind: Database["public"]["Enums"]["invoice_kind"]
          notes: string | null
          number: string | null
          period_end: string | null
          period_start: string | null
          status: string
          subtotal_minor: number
          tax_total_minor: number
          total_minor: number
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_draft_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      feed_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_summary: string
        }
        Returns: undefined
      }
      fill_staffing_request: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: {
          allocation_pct: number
          created_at: string
          created_by: string | null
          duration_weeks: number | null
          filled_by_assignment: string | null
          id: string
          notes: string | null
          project_id: string | null
          role_title: string
          seniority: Database["public"]["Enums"]["skill_level"] | null
          skills: string[]
          start_date: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "staffing_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fsm_actions: {
        Args: {
          p_allowed_actions?: string[]
          p_entity_type: string
          p_state: string
        }
        Returns: Json
      }
      fsm_transition: {
        Args: {
          p_action: string
          p_comment?: string
          p_entity_id: string
          p_entity_type: string
          p_from_state: string
        }
        Returns: string
      }
      generate_draft_invoice: {
        Args: {
          p_client_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: {
          client_id: string
          created_at: string
          credits_invoice_id: string | null
          currency: string
          due_date: string | null
          dunning_paused: boolean
          id: string
          issued_at: string | null
          issued_by: string | null
          kind: Database["public"]["Enums"]["invoice_kind"]
          notes: string | null
          number: string | null
          period_end: string | null
          period_start: string | null
          status: string
          subtotal_minor: number
          tax_total_minor: number
          total_minor: number
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_payout_statements: {
        Args: { p_period_end: string; p_period_start: string }
        Returns: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          id: string
          note: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          total_minor: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payout_statements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_exact_role: { Args: { check_role: string }; Returns: boolean }
      has_role: { Args: { check_role: string }; Returns: boolean }
      invoice_actions: { Args: { p_invoice_id: string }; Returns: Json }
      invoke_edge_function: { Args: { p_fn: string }; Returns: undefined }
      is_project_pm: { Args: { p_project_id: string }; Returns: boolean }
      issue_invoice: {
        Args: { p_invoice_id: string }
        Returns: {
          client_id: string
          created_at: string
          credits_invoice_id: string | null
          currency: string
          due_date: string | null
          dunning_paused: boolean
          id: string
          issued_at: string | null
          issued_by: string | null
          kind: Database["public"]["Enums"]["invoice_kind"]
          notes: string | null
          number: string | null
          period_end: string | null
          period_start: string | null
          status: string
          subtotal_minor: number
          tax_total_minor: number
          total_minor: number
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      job_approval_nudges: { Args: never; Returns: number }
      job_dunning_scan: { Args: never; Returns: number }
      job_timesheet_reminders: { Args: never; Returns: number }
      mark_overdue_invoices: { Args: never; Returns: number }
      mark_payout_paid: {
        Args: { p_statement_id: string }
        Returns: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          id: string
          note: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          total_minor: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payout_statements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_day: { Args: never; Returns: Json }
      notify_user: {
        Args: {
          p_body?: string
          p_kind: string
          p_link?: string
          p_payload?: Json
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      payout_statement_actions: {
        Args: { p_statement_id: string }
        Returns: Json
      }
      recompute_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      record_payment: {
        Args: {
          p_amount_minor: number
          p_invoice_id: string
          p_method?: string
          p_note?: string
          p_paid_at?: string
        }
        Returns: {
          client_id: string
          created_at: string
          credits_invoice_id: string | null
          currency: string
          due_date: string | null
          dunning_paused: boolean
          id: string
          issued_at: string | null
          issued_by: string | null
          kind: Database["public"]["Enums"]["invoice_kind"]
          notes: string | null
          number: string | null
          period_end: string | null
          period_start: string | null
          status: string
          subtotal_minor: number
          tax_total_minor: number
          total_minor: number
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_entry: {
        Args: { p_comment: string; p_entry_id: string }
        Returns: {
          adjusts_entry_id: string | null
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          created_at: string
          hours: number
          id: string
          invoice_id: string | null
          note: string | null
          project_id: string
          rejection_comment: string | null
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_cost_rate: {
        Args: { p_user_id: string; p_work_date: string }
        Returns: number
      }
      resolve_rate: {
        Args: { p_project_id: string; p_user_id: string; p_work_date: string }
        Returns: number
      }
      staffing_request_actions: {
        Args: { p_request_id: string }
        Returns: Json
      }
      submit_week: {
        Args: { p_week_start: string }
        Returns: {
          adjusts_entry_id: string | null
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          created_at: string
          hours: number
          id: string
          invoice_id: string | null
          note: string | null
          project_id: string
          rejection_comment: string | null
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
          work_date: string
        }[]
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      suggest_candidates: {
        Args: { p_request_id: string }
        Returns: {
          available_pct: number
          committed_allocation_pct: number
          full_name: string
          matched_skills: string[]
          score: number
          skill_match_count: number
          title: string
          user_id: string
        }[]
      }
      time_entry_actions: { Args: { p_entry_id: string }; Returns: Json }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: {
          client_id: string
          created_at: string
          credits_invoice_id: string | null
          currency: string
          due_date: string | null
          dunning_paused: boolean
          id: string
          issued_at: string | null
          issued_by: string | null
          kind: Database["public"]["Enums"]["invoice_kind"]
          notes: string | null
          number: string | null
          period_end: string | null
          period_start: string | null
          status: string
          subtotal_minor: number
          tax_total_minor: number
          total_minor: number
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_audit: {
        Args: {
          p_action: string
          p_diff?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "employee"
        | "pm"
        | "finance"
        | "recruiter"
        | "resourcing"
        | "sales"
        | "account_owner"
        | "owner"
        | "admin"
      billing_model: "tm" | "retainer" | "fixed"
      employment_type: "employee" | "contractor"
      invoice_grouping: "project" | "person" | "role" | "detailed"
      invoice_kind: "invoice" | "credit_note"
      project_status: "active" | "paused" | "closed"
      skill_level: "junior" | "mid" | "senior"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "employee",
        "pm",
        "finance",
        "recruiter",
        "resourcing",
        "sales",
        "account_owner",
        "owner",
        "admin",
      ],
      billing_model: ["tm", "retainer", "fixed"],
      employment_type: ["employee", "contractor"],
      invoice_grouping: ["project", "person", "role", "detailed"],
      invoice_kind: ["invoice", "credit_note"],
      project_status: ["active", "paused", "closed"],
      skill_level: ["junior", "mid", "senior"],
    },
  },
} as const

