import type { RealtimeChannel } from "@supabase/supabase-js";

import { BaseRepository } from "../base";
import type { AppNotification, MyDay } from "../types";

/** My Day cards + notifications (Module I). */
export class WorkspaceRepository extends BaseRepository {
  myDay(): Promise<MyDay> {
    return this.rpc("my_day");
  }

  notifications(): Promise<AppNotification[]> {
    return this.query(
      this.db
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)
    );
  }

  markRead(id: number): Promise<null> {
    return this.query(
      this.db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
    );
  }

  /** Live notification stream (Supabase Realtime). Returns an unsubscribe fn. */
  onNotification(userId: string, handler: (n: AppNotification) => void): () => void {
    const channel: RealtimeChannel = this.db
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => handler(payload.new as AppNotification)
      )
      .subscribe();
    return () => {
      void this.db.removeChannel(channel);
    };
  }
}
