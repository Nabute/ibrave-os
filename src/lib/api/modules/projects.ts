import { BaseRepository } from "../base";
import type { Assignment, BurnRow, Project, RateCard, Task } from "../types";

export class ProjectsRepository extends BaseRepository {
  list(): Promise<Project[]> {
    return this.query(
      this.db
        .from("projects")
        .select("*, clients ( id, name, currency )")
        .order("name")
    );
  }

  get(id: string): Promise<Project> {
    return this.query(
      this.db
        .from("projects")
        .select("*, clients ( id, name, currency )")
        .eq("id", id)
        .single()
    );
  }

  create(project: Partial<Project>): Promise<Project> {
    return this.query(this.db.from("projects").insert(project).select().single());
  }

  update(id: string, patch: Partial<Project>): Promise<Project> {
    return this.query(
      this.db.from("projects").update(patch).eq("id", id).select().single()
    );
  }

  tasks(projectId: string): Promise<Task[]> {
    return this.query(
      this.db.from("tasks").select("*").eq("project_id", projectId).order("name")
    );
  }

  saveTask(task: Partial<Task> & { project_id: string; name: string }): Promise<Task> {
    return this.query(this.db.from("tasks").upsert(task).select().single());
  }

  members(projectId: string): Promise<Assignment[]> {
    return this.query(
      this.db
        .from("assignments")
        .select("*, profiles ( id, full_name )")
        .eq("project_id", projectId)
    );
  }

  saveAssignment(
    a: Partial<Assignment> & { user_id: string; project_id: string; start_date: string }
  ): Promise<Assignment> {
    return this.query(this.db.from("assignments").upsert(a).select().single());
  }

  rateCards(projectId: string, clientId: string): Promise<RateCard[]> {
    return this.query(
      this.db
        .from("rate_cards")
        .select("*, rate_card_lines ( *, profiles ( full_name ) )")
        .or(`project_id.eq.${projectId},client_id.eq.${clientId}`)
        .order("effective_from", { ascending: false })
    );
  }

  burn(): Promise<BurnRow[]> {
    return this.query(this.db.from("v_project_burn").select("*").order("project_name"));
  }
}
