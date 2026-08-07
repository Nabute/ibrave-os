// User lifecycle operations that need the service role: creating auth users,
// banning/unbanning on deactivate, resetting passwords. Called by the FRONTEND
// with the caller's JWT (gateway verifies it); the caller must hold the admin
// or owner role — checked server-side, never trusted from the client.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, jsonResponse as json, serveJson } from "../_shared/admin.ts";

type Action =
  | {
      action: "invite";
      email: string;
      full_name: string;
      roles?: string[];
      title?: string;
      employment_type?: "employee" | "contractor";
    }
  | { action: "set_active"; user_id: string; active: boolean }
  | { action: "reset_password"; user_id: string };

/** 16 chars from a safe alphabet — handed to the admin once, never emailed. */
function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

serveJson(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Identify the caller from their JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Not authenticated" }, 401);
  const caller = userData.user;

  const db = adminClient();
  const { data: callerRoles } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);
  const isAdmin = (callerRoles ?? []).some((r) => r.role === "admin" || r.role === "owner");
  if (!isAdmin) return json({ error: "Admin role required" }, 403);

  const payload = (await req.json()) as Action;

  const audit = (action: string, entityId: string, diff: Record<string, unknown>) =>
    db.from("audit_log").insert({
      actor_id: caller.id,
      action,
      entity_type: "profile",
      entity_id: entityId,
      diff,
    });

  try {
    switch (payload.action) {
      case "invite": {
        if (!payload.email || !payload.full_name) {
          return json({ error: "email and full_name are required" }, 422);
        }
        const password = tempPassword();
        const { data: created, error } = await db.auth.admin.createUser({
          email: payload.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: payload.full_name },
        });
        if (error) return json({ error: error.message }, 400);
        const userId = created.user.id;

        // The auth trigger created the profile; enrich it.
        await db
          .from("profiles")
          .update({
            full_name: payload.full_name,
            title: payload.title ?? null,
            employment_type: payload.employment_type ?? "employee",
          })
          .eq("id", userId);

        const roles = (payload.roles ?? []).length ? payload.roles! : ["employee"];
        await db
          .from("user_roles")
          .insert(roles.map((role) => ({ user_id: userId, role })));

        await audit("admin.invite_user", userId, {
          email: payload.email,
          roles,
        });
        // The temp password is returned to the admin ONCE — not emailed, not stored.
        return json({ user_id: userId, temp_password: password });
      }

      case "set_active": {
        if (!payload.user_id) return json({ error: "user_id required" }, 422);
        if (payload.user_id === caller.id && !payload.active) {
          return json({ error: "You cannot deactivate yourself" }, 422);
        }
        const { error } = await db.auth.admin.updateUserById(payload.user_id, {
          // ~100 years = deactivated; "none" lifts the ban.
          ban_duration: payload.active ? "none" : "876000h",
        });
        if (error) return json({ error: error.message }, 400);
        await db.from("profiles").update({ active: payload.active }).eq("id", payload.user_id);
        await audit("admin.set_active", payload.user_id, { active: payload.active });
        return json({ ok: true });
      }

      case "reset_password": {
        if (!payload.user_id) return json({ error: "user_id required" }, 422);
        const password = tempPassword();
        const { error } = await db.auth.admin.updateUserById(payload.user_id, { password });
        if (error) return json({ error: error.message }, 400);
        await audit("admin.reset_password", payload.user_id, {});
        return json({ temp_password: password });
      }

      default:
        return json({ error: "Unknown action" }, 422);
    }
  } catch (e) {
    console.error("admin-users error", e);
    return json({ error: String(e) }, 500);
  }
});

