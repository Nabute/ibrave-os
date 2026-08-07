import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError, fromPostgrest } from "./errors";

/** The single injectable config (meqenet's ApiConfig, Supabase edition). */
export interface ApiConfig {
  client: SupabaseClient;
}

/**
 * Base repository: owns the Supabase client and error translation so
 * concrete repositories never touch raw responses. Two verbs:
 *   query(...) , unwrap a PostgREST builder result
 *   rpc(...)   , call a Postgres function (all workflow actions go here;
 *                 the frontend never performs financial state changes as
 *                 multi-step client writes)
 */
export abstract class BaseRepository {
  constructor(protected readonly config: ApiConfig) {}

  protected get db(): SupabaseClient {
    return this.config.client;
  }

  protected async query<T>(
    builder: PromiseLike<{ data: unknown; error: unknown }>
  ): Promise<T> {
    const { data, error } = await builder;
    if (error) throw this.translate(error);
    return data as T;
  }

  protected async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw this.translate(error);
    return data as T;
  }

  private translate(error: unknown): ApiError {
    if (error && typeof error === "object" && "message" in error && "code" in error) {
      return fromPostgrest(error as never);
    }
    return new ApiError(undefined, String(error));
  }
}
