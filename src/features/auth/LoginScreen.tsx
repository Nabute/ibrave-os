import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full opacity-25 blur-3xl"
          style={{ background: "hsl(var(--brass))" }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brass font-display text-xl leading-none text-brass-foreground">
            i
          </div>
          <span className="font-display text-xl tracking-tight">ibrave&nbsp;OS</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-[44px] leading-[1.05] tracking-[-0.02em] text-white">
            One system, from first hello to final invoice.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-sidebar-muted">
            Hours logged once drive approvals, invoices, payouts and margin —
            every number traceable to the record that produced it.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-muted">
          © {new Date().getFullYear()} ibrave — internal platform
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="font-display text-2xl tracking-tight">ibrave&nbsp;OS</span>
          </div>
          <h2 className="font-display text-2xl tracking-tight">Welcome back</h2>
          <p className="mb-8 mt-1.5 text-sm text-muted-foreground">
            Sign in to your workspace
          </p>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          {import.meta.env.DEV && (
            <p className="mt-8 rounded-lg border border-dashed px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Demo: owner@ibrave.co · pm@ibrave.co · finance@ibrave.co ·
              dev1@ibrave.co — password <code>password123</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
