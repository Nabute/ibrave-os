import { BaseRepository } from "../base";
import type { Client, Contact, Invoice, Project, RateCard } from "../types";

export class ClientsRepository extends BaseRepository {
  list(): Promise<Client[]> {
    return this.query(this.db.from("clients").select("*").order("name"));
  }

  get(id: string): Promise<Client> {
    return this.query(this.db.from("clients").select("*").eq("id", id).single());
  }

  create(client: Partial<Client> & { name: string }): Promise<Client> {
    return this.query(this.db.from("clients").insert(client).select().single());
  }

  update(id: string, patch: Partial<Client>): Promise<Client> {
    return this.query(
      this.db.from("clients").update(patch).eq("id", id).select().single()
    );
  }

  contacts(clientId: string): Promise<Contact[]> {
    return this.query(
      this.db.from("contacts").select("*").eq("client_id", clientId).order("name")
    );
  }

  saveContact(
    contact: Partial<Contact> & { client_id: string; name: string }
  ): Promise<Contact> {
    return this.query(this.db.from("contacts").upsert(contact).select().single());
  }

  projects(clientId: string): Promise<Project[]> {
    return this.query(
      this.db.from("projects").select("*").eq("client_id", clientId).order("name")
    );
  }

  invoices(clientId: string): Promise<Invoice[]> {
    return this.query(
      this.db
        .from("invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
    );
  }

  rateCards(clientId: string): Promise<RateCard[]> {
    return this.query(
      this.db
        .from("rate_cards")
        .select("*, rate_card_lines ( *, profiles ( full_name ) )")
        .eq("client_id", clientId)
        .order("effective_from", { ascending: false })
    );
  }

  saveRateCard(card: {
    project_id?: string | null;
    client_id?: string | null;
    effective_from: string;
    note?: string;
  }): Promise<RateCard> {
    return this.query(this.db.from("rate_cards").insert(card).select().single());
  }

  saveRateLine(line: {
    rate_card_id: string;
    user_id?: string | null;
    role_name?: string | null;
    hourly_rate_minor: number;
  }): Promise<unknown> {
    return this.query(this.db.from("rate_card_lines").insert(line).select().single());
  }
}
