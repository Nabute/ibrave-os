import { useMutation } from "@tanstack/react-query";
import { Check, Moon, Sun } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toDisplayMessage, type UserPreferences } from "@/lib/api";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** A common-office shortlist plus free entry — Intl validates the rest. */
const TIMEZONES = [
  "Africa/Addis_Ababa",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
];

export function PreferencesScreen() {
  const { profile, refreshProfile, userId } = useSession();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [account, setAccount] = useState({
    full_name: profile?.full_name ?? "",
    title: profile?.title ?? "",
    timezone: profile?.timezone ?? "",
  });
  const [password, setPassword] = useState({ next: "", confirm: "" });

  const flash = (which: string) => {
    setSaved(which);
    setError(null);
    setTimeout(() => setSaved(null), 2500);
  };
  const fail = (e: unknown) => setError(toDisplayMessage(e));

  const accountMutation = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase
        .from("profiles")
        .update({
          full_name: account.full_name.trim(),
          title: account.title.trim() || null,
          timezone: account.timezone.trim() || null,
        })
        .eq("id", userId!);
      if (err) throw new Error(err.message);
      await refreshProfile();
    },
    onSuccess: () => flash("account"),
    onError: fail,
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.auth.updateUser({ password: password.next });
      if (err) throw new Error(err.message);
    },
    onSuccess: () => {
      setPassword({ next: "", confirm: "" });
      flash("password");
    },
    onError: fail,
  });

  const prefsMutation = useMutation({
    mutationFn: async (patch: UserPreferences) => {
      const next = { ...(profile?.preferences ?? {}), ...patch };
      const { error: err } = await supabase
        .from("profiles")
        .update({ preferences: next })
        .eq("id", userId!);
      if (err) throw new Error(err.message);
      await refreshProfile();
    },
    onSuccess: () => flash("prefs"),
    onError: fail,
  });

  const setTheme = (theme: "light" | "dark") => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
    prefsMutation.mutate({ theme });
  };

  const prefs = profile?.preferences ?? {};
  const emailOn = prefs.email_notifications !== false;
  const currentTheme =
    prefs.theme ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");

  return (
    <div className="space-y-4">
      <div>
        <h1>Preferences</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your account, your defaults. Company-wide settings live under Admin.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              Account
              {saved === "account" && (
                <Badge variant="success" className="ml-2 align-middle">
                  <Check className="mr-1 h-3 w-3" /> saved
                </Badge>
              )}
            </CardTitle>
            <CardDescription>How you appear across the app</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input
                value={account.full_name}
                onChange={(e) => setAccount({ ...account, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={account.title}
                placeholder="Senior Developer"
                onChange={(e) => setAccount({ ...account, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Timezone</Label>
              <Input
                list="tz-options"
                value={account.timezone}
                placeholder="Africa/Addis_Ababa"
                onChange={(e) => setAccount({ ...account, timezone: e.target.value })}
              />
              <datalist id="tz-options">
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium">{profile?.email}</span> — the
              login email can only be changed by an admin.
            </p>
            <Button
              disabled={!account.full_name.trim() || accountMutation.isPending}
              onClick={() => accountMutation.mutate()}
            >
              Save account
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              Password
              {saved === "password" && (
                <Badge variant="success" className="ml-2 align-middle">
                  <Check className="mr-1 h-3 w-3" /> changed
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Minimum 8 characters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>New password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password.next}
                onChange={(e) => setPassword({ ...password, next: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Confirm new password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password.confirm}
                onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
              />
            </div>
            {password.confirm && password.next !== password.confirm && (
              <p className="text-sm text-destructive">Passwords don't match.</p>
            )}
            <Button
              disabled={
                password.next.length < 8 ||
                password.next !== password.confirm ||
                passwordMutation.isPending
              }
              onClick={() => passwordMutation.mutate()}
            >
              Change password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Appearance</CardTitle>
            <CardDescription>Follows you across devices</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {(
                [
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors duration-fast",
                    currentTheme === key
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              Notifications
              {saved === "prefs" && (
                <Badge variant="success" className="ml-2 align-middle">
                  <Check className="mr-1 h-3 w-3" /> saved
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              In-app notifications always arrive; this controls the email copies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Email notifications</span>
                <span className="block text-xs text-muted-foreground">
                  Timesheet reminders and approval nudges by email
                </span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--brass))]"
                checked={emailOn}
                onChange={(e) =>
                  prefsMutation.mutate({ email_notifications: e.target.checked })
                }
              />
            </label>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
