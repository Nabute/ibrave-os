import { BaseRepository } from "../base";
import type { AgingRow, BurnRow, UnbilledRow, UtilizationRow } from "../types";

/** Reports (FR-20..24). Every number traceable to source records (I-5). */
export class ReportsRepository extends BaseRepository {
  unbilled(): Promise<UnbilledRow[]> {
    return this.query(
      this.db.from("v_unbilled_work").select("*").order("client_name")
    );
  }

  aging(): Promise<AgingRow[]> {
    return this.query(
      this.db.from("v_invoice_aging").select("*").order("days_overdue", { ascending: false })
    );
  }

  utilization(): Promise<UtilizationRow[]> {
    return this.query(
      this.db
        .from("v_utilization")
        .select("*")
        .order("month", { ascending: false })
        .order("full_name")
    );
  }

  burn(): Promise<BurnRow[]> {
    return this.query(this.db.from("v_project_burn").select("*").order("project_name"));
  }
}
