import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Live local time for an IANA timezone ("Europe/Berlin"), ticking on the
 * minute. Renders nothing when no zone is set, an em-dash when invalid.
 * Ledger: the figure is mono, the zone label is muted.
 */
export function LocalClock({
  timezone,
  showZone = true,
  className,
}: {
  timezone: string | null | undefined;
  showZone?: boolean;
  className?: string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!timezone) return;
    // Tick exactly on minute boundaries so the display never lags.
    let interval: ReturnType<typeof setInterval> | undefined;
    const align = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, (60 - new Date().getSeconds()) * 1000);
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, [timezone]);

  if (!timezone) return null;

  let time: string;
  let weekday: string;
  try {
    time = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
    weekday = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      weekday: "short",
    }).format(now);
  } catch {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }

  const city = timezone.split("/").pop()?.replace(/_/g, " ");
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)} title={timezone}>
      <span className="tabular-nums">{time}</span>
      <span className="text-xs text-muted-foreground">
        {weekday}
        {showZone && city ? ` · ${city}` : ""}
      </span>
    </span>
  );
}
