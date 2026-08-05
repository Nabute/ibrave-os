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

  settings(): Promise<CompanySettings> {
    return this.query(this.db.from("company_settings").select("*").single());
  }

  updateSettings(patch: Partial<CompanySettings>): Promise<CompanySettings> {
    return this.query(
      this.db.from("company_settings").update(patch).eq("id", true).select().single()
    );
  }
}
