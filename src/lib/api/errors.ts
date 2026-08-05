import type { PostgrestError } from "@supabase/supabase-js";

/**
 * The single error type every screen handles (meqenet pattern: one ApiError,
 * one `fail()` handler). Postgres errcodes surface as stable `code`s the UI
 * can branch on:
 *   P0002 → illegal workflow transition
 *   P0003 → comment required
 *   42501 → not permitted
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string | undefined,
    message: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isPermissionDenied(): boolean {
    return this.code === "42501";
  }
  get isIllegalTransition(): boolean {
    return this.code === "P0002";
  }
}

export function fromPostgrest(error: PostgrestError): ApiError {
  return new ApiError(error.code, error.message, error.details ?? undefined);
}

export function toDisplayMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
