/**
 * The repository factory (meqenet pattern): one function assembles every
 * repository from one config. `Api = ReturnType<typeof createApi>` means
 * adding a repository here automatically widens the type every consumer is
 * typed against, no second file to update.
 */
import type { ApiConfig } from "./base";
import { AccountsRepository } from "./modules/accounts";
import { AdminRepository } from "./modules/admin";
import { ApprovalsRepository } from "./modules/approvals";
import { ClientsRepository } from "./modules/clients";
import { CommandCenterRepository } from "./modules/commandCenter";
import { CommsRepository } from "./modules/comms";
import { InvoicesRepository } from "./modules/invoices";
import { PayoutsRepository } from "./modules/payouts";
import { PrivacyRepository } from "./modules/privacy";
import { ProductizationRepository } from "./modules/productization";
import { ProjectsRepository } from "./modules/projects";
import { ProspectingRepository } from "./modules/prospecting";
import { ReportsRepository } from "./modules/reports";
import { SalesRepository } from "./modules/sales";
import { SecurityRepository } from "./modules/security";
import { StaffingRepository } from "./modules/staffing";
import { TalentRepository } from "./modules/talent";
import { TimesheetsRepository } from "./modules/timesheets";
import { WorkspaceRepository } from "./modules/workspace";

export function createApi(config: ApiConfig) {
  return {
    timesheets: new TimesheetsRepository(config),
    approvals: new ApprovalsRepository(config),
    projects: new ProjectsRepository(config),
    clients: new ClientsRepository(config),
    invoices: new InvoicesRepository(config),
    payouts: new PayoutsRepository(config),
    privacy: new PrivacyRepository(config),
    productization: new ProductizationRepository(config),
    reports: new ReportsRepository(config),
    staffing: new StaffingRepository(config),
    sales: new SalesRepository(config),
    security: new SecurityRepository(config),
    accounts: new AccountsRepository(config),
    prospecting: new ProspectingRepository(config),
    talent: new TalentRepository(config),
    comms: new CommsRepository(config),
    commandCenter: new CommandCenterRepository(config),
    workspace: new WorkspaceRepository(config),
    admin: new AdminRepository(config),
  };
}

export type Api = ReturnType<typeof createApi>;

export type { ApiConfig } from "./base";
export { ApiError, toDisplayMessage } from "./errors";
export { can, actionList } from "./hateoas";
export type { WorkflowAction, WorkflowActions } from "./hateoas";
export * from "./types";
