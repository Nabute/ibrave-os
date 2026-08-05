import { ApiError } from "../errors";
import { BaseRepository } from "../base";
import type {
  CalendarEvent,
  EmailIdentity,
  EmailIdentityRow,
  EmailLogRow,
  SendEmailPayload,
} from "../types";

/**
 * In-app communications: email (via the send-user-email Edge Function, which
 * logs every send and mirrors it into the entity timeline) and the calendar.
 * Users never leave the app to send or schedule.
 */
export class CommsRepository extends BaseRepository {
  async sendEmail(payload: SendEmailPayload): Promise<{ ok: boolean; log_id?: number }> {
    const { data, error } = await this.db.functions.invoke("send-user-email", {
      body: payload,
    });
    if (error) throw new ApiError(undefined, error.message ?? "Email send failed");
    if (data && data.ok === false) {
      throw new ApiError(undefined, data.detail ?? "Email provider rejected the message");
    }
    return data as { ok: boolean; log_id?: number };
  }

  /** The From addresses this user may send as (own email + department ones). */
  myIdentities(): Promise<EmailIdentity[]> {
    return this.rpc("my_email_identities");
  }

  identities(): Promise<EmailIdentityRow[]> {
    return this.query(this.db.from("email_identities").select("*").order("email"));
  }

  addIdentity(identity: {
    email: string;
    display_name: string;
    allowed_roles: string[];
  }): Promise<EmailIdentityRow> {
    return this.query(
      this.db.from("email_identities").insert(identity).select().single()
    );
  }

  setIdentityActive(id: string, active: boolean): Promise<EmailIdentityRow> {
    return this.query(
      this.db.from("email_identities").update({ active }).eq("id", id).select().single()
    );
  }

  emailLog(filter?: { client_id?: string; candidate_id?: string }): Promise<EmailLogRow[]> {
    let q = this.db
      .from("email_log")
      .select("*, profiles ( full_name )")
      .order("created_at", { ascending: false })
      .limit(50);
    if (filter?.client_id) q = q.eq("client_id", filter.client_id);
    if (filter?.candidate_id) q = q.eq("candidate_id", filter.candidate_id);
    return this.query(q);
  }

  // -- calendar --------------------------------------------------------------

  events(fromIso: string, toIso: string): Promise<CalendarEvent[]> {
    return this.query(
      this.db
        .from("calendar_events")
        .select("*, calendar_attendees ( * ), profiles!calendar_events_organizer_id_fkey ( full_name )")
        .gte("starts_at", fromIso)
        .lte("starts_at", toIso)
        .is("cancelled_at", null)
        .order("starts_at")
    );
  }

  scheduleEvent(payload: {
    title: string;
    description?: string;
    location?: string;
    starts_at: string;
    ends_at: string;
    attendee_user_ids?: string[];
    external?: { email: string; name?: string }[];
    client_id?: string;
    lead_id?: string;
    prospect_id?: string;
    candidate_id?: string;
    interview_round_id?: string;
  }): Promise<CalendarEvent> {
    return this.rpc("schedule_event", { p: payload });
  }

  cancelEvent(eventId: string): Promise<null> {
    return this.rpc("cancel_event", { p_event_id: eventId });
  }

  respond(attendeeId: number, response: "accepted" | "declined"): Promise<null> {
    return this.query(
      this.db.from("calendar_attendees").update({ response }).eq("id", attendeeId)
    );
  }
}
