import { BaseRepository } from "../base";

export class SecurityRepository extends BaseRepository {
  recordEvent(
    eventType: string,
    detail: Record<string, unknown> = {},
    severity: "info" | "low" | "medium" | "high" | "critical" = "low"
  ): Promise<number> {
    return this.rpc("record_security_event", {
      p_event_type: eventType,
      p_severity: severity,
      p_source: "frontend",
      p_detail: detail,
    });
  }
}
