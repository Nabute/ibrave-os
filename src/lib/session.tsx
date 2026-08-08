import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createApi, type Api, type AppRole, type Profile } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface SessionState {
  userId: string | null;
  workspaceId: string | null;
  profile: Profile | null;
  roles: AppRole[];
  ready: boolean;
  api: Api;
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
  /** Re-fetch the profile after the user edits their own account. */
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => createApi({ client: supabase }), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      if (!data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      if (!session) {
        setWorkspaceId(null);
        setProfile(null);
        setRoles([]);
        setReady(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { profile: prof, roles: scopedRoles, workspaceId: scopedWorkspaceId } =
        await loadWorkspaceSession(userId);
      if (cancelled) return;
      setProfile(prof as Profile);
      setWorkspaceId(scopedWorkspaceId);
      setRoles(scopedRoles);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<SessionState>(
    () => ({
      userId,
      workspaceId,
      profile,
      roles,
      ready,
      api,
      // owner/admin implicitly hold every non-owner role (matches SQL has_role()).
      hasRole: (role) =>
        roles.includes(role) ||
        roles.includes("owner") ||
        (role !== "owner" && roles.includes("admin")),
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshProfile: async () => {
        if (!userId) return;
        const { profile: prof, roles: scopedRoles, workspaceId: scopedWorkspaceId } =
          await loadWorkspaceSession(userId);
        if (prof) setProfile(prof as Profile);
        setWorkspaceId(scopedWorkspaceId);
        setRoles(scopedRoles);
      },
    }),
    [userId, workspaceId, profile, roles, ready, api]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** Repository access hook, the factory-made Api object. */
export function useApi(): Api {
  return useSession().api;
}

async function loadWorkspaceSession(userId: string): Promise<{
  profile: Profile | null;
  workspaceId: string | null;
  roles: AppRole[];
}> {
  const [{ data: prof }, workspace, legacyRoles] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("workspace_memberships")
      .select("workspace_id, role")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(50),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  const workspaceRows = workspace.error ? [] : workspace.data ?? [];
  const roleRows = workspaceRows.length ? workspaceRows : legacyRoles.data ?? [];
  return {
    profile: (prof as Profile | null) ?? null,
    workspaceId: workspaceRows[0]?.workspace_id ?? null,
    roles: roleRows.map((r) => r.role as AppRole),
  };
}
