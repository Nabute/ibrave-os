import { BaseRepository } from "../base";
import { ApiError } from "../errors";
import type {
  ClientApprovalRequest,
  ClientDocument,
  ClientPortalUser,
  IntegrationConnection,
  IntegrationProvider,
  IntegrationProviderStatus,
  IntegrationSyncResult,
  IntegrationSyncRun,
  OnboardingImportBatch,
  TrustArtifact,
  UserSavedView,
  WorkspaceSetupStep,
} from "../types";

/** SaaS/productization surfaces: setup, imports, integrations, portal, trust. */
export class ProductizationRepository extends BaseRepository {
  setupSteps(): Promise<WorkspaceSetupStep[]> {
    return this.query(
      this.db.from("workspace_setup_steps").select("*").order("created_at")
    );
  }

  updateSetupStep(
    key: string,
    patch: Partial<Pick<WorkspaceSetupStep, "status" | "metadata">>
  ): Promise<WorkspaceSetupStep> {
    return this.query(
      this.db
        .from("workspace_setup_steps")
        .update({
          ...patch,
          completed_at: patch.status === "done" ? new Date().toISOString() : undefined,
        })
        .eq("key", key)
        .select()
        .single()
    );
  }

  importBatches(): Promise<OnboardingImportBatch[]> {
    return this.query(
      this.db.from("onboarding_import_batches").select("*").order("created_at", { ascending: false })
    );
  }

  createImportBatch(payload: {
    import_type: OnboardingImportBatch["import_type"];
    filename?: string;
    column_map?: Record<string, unknown>;
  }): Promise<OnboardingImportBatch> {
    return this.query(
      this.db.from("onboarding_import_batches").insert(payload).select().single()
    );
  }

  integrations(): Promise<IntegrationConnection[]> {
    return this.query(
      this.db.from("integration_connections").select("*").order("provider")
    );
  }

  integrationSyncRuns(connectionId: string): Promise<IntegrationSyncRun[]> {
    return this.query(
      this.db
        .from("integration_sync_runs")
        .select("*")
        .eq("connection_id", connectionId)
        .order("created_at", { ascending: false })
        .limit(10)
    );
  }

  upsertIntegration(payload: {
    provider: IntegrationProvider;
    display_name: string;
    external_tenant_id?: string | null;
    token_secret_name?: string | null;
    config?: Record<string, unknown>;
  }): Promise<IntegrationConnection> {
    return this.query(
      this.db.from("integration_connections").insert(payload).select().single()
    );
  }

  async integrationProviderStatus(): Promise<IntegrationProviderStatus[]> {
    const { data, error } = await this.db.functions.invoke("integrations", {
      body: { action: "provider_status" },
    });
    if (error) throw new ApiError(undefined, error.message ?? "Integration status check failed");
    return (data as { providers: IntegrationProviderStatus[] }).providers;
  }

  async syncIntegration(connectionId: string, objectType = "productivity"): Promise<IntegrationSyncResult> {
    const { data, error } = await this.db.functions.invoke("integrations", {
      body: { action: "sync", connection_id: connectionId, object_type: objectType, direction: "pull" },
    });
    if (error) throw new ApiError(undefined, error.message ?? "Integration sync failed");
    if (data && data.ok === false) {
      const detail = (data as IntegrationSyncResult).result?.error ?? "Integration provider rejected the sync";
      throw new ApiError(undefined, detail);
    }
    return data as IntegrationSyncResult;
  }

  savedViews(surface: string): Promise<UserSavedView[]> {
    return this.query(
      this.db.from("user_saved_views").select("*").eq("surface", surface).order("name")
    );
  }

  saveView(payload: Pick<UserSavedView, "surface" | "name" | "config" | "is_default"> & { user_id: string }): Promise<UserSavedView> {
    return this.query(this.db.from("user_saved_views").insert(payload).select().single());
  }

  clientPortalUsers(clientId: string): Promise<ClientPortalUser[]> {
    return this.query(
      this.db.from("client_portal_users").select("*").eq("client_id", clientId).order("email")
    );
  }

  createClientPortalUser(
    payload: Pick<ClientPortalUser, "client_id" | "email"> &
      Partial<Pick<ClientPortalUser, "full_name" | "status" | "invited_by">>
  ): Promise<ClientPortalUser> {
    return this.query(this.db.from("client_portal_users").insert(payload).select().single());
  }

  clientDocuments(clientId: string): Promise<ClientDocument[]> {
    return this.query(
      this.db.from("client_documents").select("*").eq("client_id", clientId).order("created_at", { ascending: false })
    );
  }

  createClientDocument(
    payload: Pick<ClientDocument, "client_id" | "title" | "storage_path"> &
      Partial<Pick<ClientDocument, "project_id" | "uploaded_by" | "content_type" | "visibility">>
  ): Promise<ClientDocument> {
    return this.query(this.db.from("client_documents").insert(payload).select().single());
  }

  clientApprovalRequests(clientId: string): Promise<ClientApprovalRequest[]> {
    return this.query(
      this.db.from("client_approval_requests").select("*").eq("client_id", clientId).order("created_at", { ascending: false })
    );
  }

  createClientApprovalRequest(
    payload: Pick<ClientApprovalRequest, "client_id" | "title"> &
      Partial<Pick<ClientApprovalRequest, "project_id" | "invoice_id" | "body" | "requested_by">>
  ): Promise<ClientApprovalRequest> {
    return this.query(this.db.from("client_approval_requests").insert(payload).select().single());
  }

  trustArtifacts(): Promise<TrustArtifact[]> {
    return this.query(
      this.db.from("trust_artifacts").select("*").order("artifact_type")
    );
  }

  createTrustArtifact(
    payload: Pick<TrustArtifact, "artifact_type" | "title"> &
      Partial<Pick<TrustArtifact, "storage_path" | "public_url" | "status" | "metadata">>
  ): Promise<TrustArtifact> {
    return this.query(this.db.from("trust_artifacts").insert(payload).select().single());
  }
}
