/**
 * Application-level loading screen: shown while the session is being
 * restored, the profile loads, or the MFA gate evaluates. Mirrors the
 * static splash in index.html so the handoff from HTML → React is seamless.
 */
export function SplashScreen({ label = "Loading your workspace…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brass font-display text-2xl leading-none text-brass-foreground">
          i
        </div>
        <span className="font-display text-3xl tracking-tight text-foreground">
          ibrave&nbsp;OS
        </span>
      </div>
      <div className="h-0.5 w-36 overflow-hidden rounded-full bg-border">
        <div className="splash-bar h-full w-1/3 rounded-full bg-brass" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
