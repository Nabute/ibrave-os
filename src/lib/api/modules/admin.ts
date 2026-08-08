import { ApiError } from "../errors";
import { BaseRepository } from "../base";
import type {
  AppRole,
  CompanySettings,
  PrivacyRequest,
  PrivacyRequestStatus,
  Profile,
  SecurityEvent,
} from "../types";

export class AdminRepository extends BaseRepository {
  async people(): Promise<(Profile & { user_roles: { role: AppRole }[] })[]> {
    const workspaceId = await this.currentWorkspaceId();
    const [{ data: people, error: peopleError }, scopedRoles, legacyRoles] = await Promise.all([
      this.db.from("profiles").select("*").order("full_name"),
      this.db
        .from("workspace_memberships")
        .select("user_id, role")
        .eq("workspace_id", workspaceId)
        .eq("status", "active"),
      this.db.from("user_roles").select("user_id, role"),
    ]);
    if (peopleError) throw this.translateAny(peopleError);
    const roleRows = scopedRoles.error ? legacyRoles.data ?? [] : scopedRoles.data ?? [];
    return ((people ?? []) as Profile[]).map((person) => ({
      ...person,
      user_roles: roleRows
        .filter((row) => row.user_id === person.id)
        .map((row) => ({ role: row.role as AppRole })),
    }));
  }

  async grantRole(userId: string, role: AppRole): Promise<unknown> {
    const workspaceId = await this.currentWorkspaceId();
    return this.query(
      this.db
        .from("workspace_memberships")
        .insert({ workspace_id: workspaceId, user_id: userId, role })
        .select()
    );
  }

  async revokeRole(userId: string, role: AppRole): Promise<null> {
    const workspaceId = await this.currentWorkspaceId();
    return this.query(
      this.db
        .from("workspace_memberships")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("role", role)
    );
  }

  /** Admin edit of another person's profile (RLS: profiles_admin_all). */
  updatePerson(
    userId: string,
    patch: Partial<
      Pick<Profile, "full_name" | "title" | "employment_type" | "weekly_capacity_hours" | "mfa_required">
    >
  ): Promise<Profile> {
    return this.query(
      this.db.from("profiles").update(patch).eq("id", userId).select().single()
    );
  }

  /** Create the auth user + profile + roles; returns a one-time temp password. */
  async inviteUser(payload: {
    email: string;
    full_name: string;
    roles: AppRole[];
    title?: string;
    employment_type?: "employee" | "contractor";
  }): Promise<{ user_id: string; temp_password: string }> {
    return this.adminUsers({ action: "invite", ...payload });
  }

  /** Deactivate = auth ban + profiles.active=false; reactivate lifts both. */
  async setUserActive(userId: string, active: boolean): Promise<void> {
    await this.adminUsers({ action: "set_active", user_id: userId, active });
  }

  async resetPassword(userId: string): Promise<{ temp_password: string }> {
    return this.adminUsers({ action: "reset_password", user_id: userId });
  }

  private async adminUsers<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.functions.invoke("admin-users", { body });
    if (error) {
      // The gateway wraps function 4xx bodies; surface the real message.
      const detail = (await (error as { context?: Response }).context
        ?.json()
        .catch(() => null)) as { error?: string } | null;
      throw new ApiError(undefined, detail?.error ?? error.message);
    }
    if (data?.error) throw new ApiError(undefined, String(data.error));
    return data as T;
  }

  async settings(): Promise<CompanySettings> {
    const workspaceId = await this.currentWorkspaceId();
    const scoped = await this.db
      .from("workspace_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();
    if (!scoped.error) return scoped.data as CompanySettings;
    return this.query(this.db.from("company_settings").select("*").single());
  }

  async updateSettings(patch: Partial<CompanySettings>): Promise<CompanySettings> {
    const workspaceId = await this.currentWorkspaceId();
    const scoped = await this.db
      .from("workspace_settings")
      .update(patch)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (!scoped.error) return scoped.data as CompanySettings;
    return this.query(this.db.from("company_settings").update(patch).eq("id", true).select().single());
  }

  privacyRequests(): Promise<PrivacyRequest[]> {
    return this.query(
      this.db.from("privacy_requests").select("*").order("due_at", { ascending: true })
    );
  }

  updatePrivacyRequest(
    id: string,
    patch: { status?: PrivacyRequestStatus; response_note?: string | null }
  ): Promise<PrivacyRequest> {
    return this.query(
      this.db.from("privacy_requests").update(patch).eq("id", id).select().single()
    );
  }

  privacyRetentionDue(): Promise<Record<string, unknown>> {
    return this.rpc("privacy_retention_due");
  }

  securityEvents(): Promise<SecurityEvent[]> {
    return this.query(
      this.db
        .from("security_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)
    );
  }

  private async currentWorkspaceId(): Promise<string> {
    const { data, error } = await this.db.rpc("current_workspace_id");
    if (!error && typeof data === "string") return data;
    return "00000000-0000-4000-8000-000000000001";
  }

  private translateAny(error: unknown): Error {
    return error instanceof Error ? error : new ApiError(undefined, String(error));
  }
}
