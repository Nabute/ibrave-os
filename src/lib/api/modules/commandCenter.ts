import { BaseRepository } from "../base";
import type {
  ActivityFeedRow,
  CommandCenterPulse,
  EngagementBoardRow,
  OwnerAlertRule,
  TwoSidedPipelineRow,
} from "../types";

/** Owner Command Center (Module I). Owner-only, the RPCs enforce it. */
export class CommandCenterRepository extends BaseRepository {
  pulse(): Promise<CommandCenterPulse> {
    return this.rpc("command_center");
  }

  engagementBoard(): Promise<EngagementBoardRow[]> {
    return this.query(
      this.db
        .from("v_engagement_board")
        .select("*")
        .order("risk_score", { ascending: false })
    );
  }

  twoSidedPipeline(months = 6): Promise<TwoSidedPipelineRow[]> {
    return this.rpc("two_sided_pipeline", { p_months: months });
  }

  activityFeed(limit = 100): Promise<ActivityFeedRow[]> {
    return this.query(
      this.db
        .from("activity_feed")
        .select("*")
        .order("at", { ascending: false })
        .limit(limit)
    );
  }

  /** Live feed subscription (I-2). Returns an unsubscribe fn. */
  onFeedEvent(handler: (row: ActivityFeedRow) => void): () => void {
    const channel = this.db
      .channel("activity-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_feed" },
        (payload) => handler(payload.new as ActivityFeedRow)
      )
      .subscribe();
    return () => {
      void this.db.removeChannel(channel);
    };
  }

  alertRules(): Promise<OwnerAlertRule[]> {
    return this.query(
      this.db.from("owner_alert_rules").select("*").order("created_at")
    );
  }

  saveAlertRule(rule: {
    id?: string;
    metric: string;
    comparator: "gt" | "lt";
    threshold: number;
    active?: boolean;
  }): Promise<OwnerAlertRule> {
    return this.query(this.db.from("owner_alert_rules").upsert(rule).select().single());
  }

  deleteAlertRule(id: string): Promise<null> {
    return this.query(this.db.from("owner_alert_rules").delete().eq("id", id));
  }
}
