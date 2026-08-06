import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

type GateState =
  | { kind: "checking" }
  | { kind: "verify"; factorId: string }
  | { kind: "enroll" }
  | { kind: "open" };

/**
 * MFA gate (sits between login and the workspace):
 *  - user has a verified TOTP factor but the session is still AAL1 → verify
 *  - policy mandates MFA (role or per-user) and nothing is enrolled → enroll
 *  - otherwise → straight through. Off by default for everyone else.
 */
export function MfaGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "checking" });

  const evaluate = useCallback(async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f) => f.status === "verified");
      if (totp) {
        setState({ kind: "verify", factorId: totp.id });
        return;
      }
    }
    const { data: required } = await supabase.rpc("my_mfa_requirement");
    if (required === true) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.some((f) => f.status === "verified");
      if (!verified) {
        setState({ kind: "enroll" });
        return;
      }
    }
    setState({ kind: "open" });
  }, []);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  if (state.kind === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking security…
      </div>
    );
  }
  if (state.kind === "verify") {
    return <VerifyStep factorId={state.factorId} onDone={() => setState({ kind: "open" })} />;
  }
  if (state.kind === "enroll") {
    return <EnrollStep onDone={() => setState({ kind: "open" })} />;
  }
  return <>{children}</>;
}

function Shell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  const { signOut } = useSession();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brass text-brass-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="font-display text-xl tracking-tight">ibrave&nbsp;OS</span>
        </div>
        <h1 className="font-display text-2xl tracking-tight">{title}</h1>
        <p className="mb-6 mt-1.5 text-sm leading-relaxed text-muted-foreground">{sub}</p>
        {children}
        <button
          onClick={() => void signOut()}
          className="mt-6 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}

function VerifyStep({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setError(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) {
      setError(chErr.message);
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.id,
      code: code.trim(),
    });
    setBusy(false);
    if (vErr) setError(vErr.message);
    else onDone();
  }

  return (
    <Shell title="Two-factor check" sub="Enter the 6-digit code from your authenticator app.">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="totp">Authentication code</Label>
          <Input
            id="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && void verify()}
            className="text-center font-mono text-lg tracking-[0.4em]"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={code.length !== 6 || busy} onClick={() => void verify()}>
          {busy ? "Verifying…" : "Verify"}
        </Button>
      </div>
    </Shell>
  );
}

export function EnrollStep({ onDone }: { onDone: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // clear stale unverified factors from abandoned attempts
      // (listFactors().totp is typed as verified-only; check the full list)
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all?.filter(
        (x) => x.factor_type === "totp" && x.status === "unverified"
      ) ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (err) setError(err.message);
      else {
        setQr(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
      }
    })();
  }, []);

  async function confirm() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) {
      setError(chErr.message);
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.id,
      code: code.trim(),
    });
    setBusy(false);
    if (vErr) setError(vErr.message);
    else onDone();
  }

  return (
    <Shell
      title="Set up two-factor authentication"
      sub="Your role requires MFA. Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy…), then confirm with a code."
    >
      <div className="space-y-4">
        {qr ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4">
            <img src={qr} alt="TOTP QR code" className="h-44 w-44" />
            {secret && (
              <p className="break-all text-center font-mono text-xs text-muted-foreground">
                {secret}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Preparing enrollment…</p>
        )}
        <div className="space-y-1">
          <Label htmlFor="enroll-code">Code from the app</Label>
          <Input
            id="enroll-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center font-mono text-lg tracking-[0.4em]"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={code.length !== 6 || busy || !factorId} onClick={() => void confirm()}>
          {busy ? "Confirming…" : "Activate MFA"}
        </Button>
      </div>
    </Shell>
  );
}
