import { BaseRepository } from "../base";
import type { PrivacyRequest, PrivacyRetentionPolicy } from "../types";

export class PrivacyRepository extends BaseRepository {
  requests(): Promise<PrivacyRequest[]> {
    return this.query(
      this.db.from("privacy_requests").select("*").order("created_at", { ascending: false })
    );
  }

  retentionPolicies(): Promise<PrivacyRetentionPolicy[]> {
    return this.query(
      this.db.from("privacy_retention_policies").select("*").order("data_area")
    );
  }

  submitRequest(requestType: PrivacyRequest["request_type"], details: string): Promise<PrivacyRequest> {
    return this.rpc("submit_privacy_request", {
      p_request_type: requestType,
      p_details: details,
    });
  }

  exportMine(): Promise<Record<string, unknown>> {
    return this.rpc("my_privacy_export");
  }
}
