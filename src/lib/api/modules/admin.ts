import { ApiError } from "../errors";
import { BaseRepository } from "../base";
import type { AppRole, CompanySettings, Profile } from "../types";

export class AdminRepository extends BaseRepository {
  people(): Promise<(Profile & { user_roles: { role: AppRole }[] })[]> {
    return this.query(
      this.db.from("profiles").select("*, user_roles ( role )").order("full_name")
    );
  }

  grantRole(userId: string, role: AppRole): Promise<unknown> {
    return this.query(
      this.db.from("user_roles").insert({ user_id: userId, role }).select()
    );
  }

  revokeRole(userId: string, role: AppRole): Promise<null> {
    return this.query(
      this.db.from("user_roles").delete().eq("user_id", userId).eq("role", role)
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

  settings(): Promise<CompanySettings> {
    return this.query(this.db.from("company_settings").select("*").single());
  }

  updateSettings(patch: Partial<CompanySettings>): Promise<CompanySettings> {
    return this.query(
      this.db.from("company_settings").update(patch).eq("id", true).select().single()
    );
  }
}
