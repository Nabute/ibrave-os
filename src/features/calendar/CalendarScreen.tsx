import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";
import { useMemo, useState } from "react";

import { KpiTile } from "@/components/KpiTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toDisplayMessage, type CalendarEvent } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function CalendarScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  // The visible range drives both the query and the summary numbers.
  const range = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 1 });
      return { start, end: addDays(start, 7), label: `Week of ${iso(start)}` };
    }
    const start = startOfMonth(anchor);
    return {
      start,
      end: addDays(endOfMonth(anchor), 1),
      label: format(anchor, "MMMM yyyy"),
    };
  }, [mode, anchor]);

  const { data: events } = useQuery({
    queryKey: ["calendar", mode, iso(range.start)],
    queryFn: () =>
      api.comms.events(
        `${iso(range.start)}T00:00:00Z`,
        `${iso(range.end)}T00:00:00Z`
      ),
  });
  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.talent.people(),
  });

  const todayIso = iso(new Date());
  const now = Date.now();

  // Summary for the selected period.
  const summary = useMemo(() => {
    const all = events ?? [];
    return {
      total: all.length,
      today: all.filter((e) => e.starts_at.slice(0, 10) === todayIso).length,
      upcoming: all.filter((e) => new Date(e.starts_at).getTime() >= now).length,
      withExternals: all.filter((e) =>
        (e.calendar_attendees ?? []).some((a) => a.email && !a.user_id)
      ).length,
    };
  }, [events, todayIso, now]);

  const step = (dir: 1 | -1) =>
    setAnchor(mode === "week" ? addDays(anchor, dir * 7) : addMonths(anchor, dir));

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["calendar"] });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.comms.cancelEvent(id),
    onSuccess: () => {
      setSelected(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const eventsOn = (day: string) =>
    (events ?? [])
      .filter((e) => e.starts_at.slice(0, 10) === day)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Calendar</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Meetings, check-ins and interviews — scheduled here, invites emailed with a
            proper calendar attachment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* view toggle */}
          <div className="flex rounded-md border p-0.5">
            {(["month", "week"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-[5px] px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-fast",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{range.label}</span>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button>
                <CalendarPlus className="h-4 w-4" /> New event
              </Button>
            </DialogTrigger>
            <NewEventDialog
              people={people ?? []}
              onDone={() => {
                setShowNew(false);
                invalidate();
              }}
            />
          </Dialog>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* summary for the visible period */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={`Events · ${mode}`} value={String(summary.total)} sub={range.label} />
        <KpiTile
          label="Upcoming"
          value={String(summary.upcoming)}
          sub="from now, in this period"
          kind={summary.upcoming > 0 ? "default" : undefined}
        />
        <KpiTile
          label="Today"
          value={String(summary.today)}
          sub={format(new Date(), "EEE, MMM d")}
          kind={summary.today > 0 ? "attention" : "default"}
        />
        <KpiTile
          label="With external guests"
          value={String(summary.withExternals)}
          sub="client-facing in this period"
        />
      </div>

      {mode === "month" ? (
        <MonthGrid
          anchor={anchor}
          todayIso={todayIso}
          eventsOn={eventsOn}
          onOpen={setSelected}
          onMore={(day) => {
            setAnchor(new Date(day + "T00:00:00"));
            setMode("week");
          }}
        />
      ) : (
        <WeekGrid
          start={range.start}
          todayIso={todayIso}
          eventsOn={eventsOn}
          onOpen={setSelected}
        />
      )}

      {/* legend */}
      <p className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted" /> past
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brass" /> today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border bg-card" /> upcoming
        </span>
      </p>

      {/* Event detail */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>
                  {format(new Date(selected.starts_at), "EEE MMM d, HH:mm")} –{" "}
                  {format(new Date(selected.ends_at), "HH:mm")}
                  {selected.profiles && ` · organized by ${selected.profiles.full_name}`}
                </DialogDescription>
              </DialogHeader>
              {selected.location && (
                <p className="text-sm">
                  <MapPin className="mr-1 inline h-4 w-4 align-text-bottom text-muted-foreground" />
                  {selected.location}
                </p>
              )}
              {selected.description && (
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(selected.calendar_attendees ?? []).map((a) => (
                  <Badge
                    key={a.id}
                    variant={
                      a.response === "accepted"
                        ? "success"
                        : a.response === "declined"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {a.name ?? a.email ?? "internal"}
                  </Badge>
                ))}
              </div>
              {selected.organizer_id === userId && (
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={() => cancelMutation.mutate(selected.id)}
                    disabled={cancelMutation.isPending}
                  >
                    <X className="h-4 w-4" /> Cancel event
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Month grid: Mon-first, out-of-month cells dimmed; past / today / future
 *  carry distinct treatments so the week at hand reads at a glance. */
function MonthGrid({
  anchor,
  todayIso,
  eventsOn,
  onOpen,
  onMore,
}: {
  anchor: Date;
  todayIso: string;
  eventsOn: (day: string) => CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onMore: (day: string) => void;
}) {
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const weeks = useMemo(() => {
    const out: string[][] = [];
    let d = gridStart;
    // 4–6 rows depending on the month; stop once we passed month end on a Monday
    while (d <= endOfMonth(anchor) || out.length < 4) {
      out.push(Array.from({ length: 7 }, (_, i) => iso(addDays(d, i))));
      d = addDays(d, 7);
      if (out.length >= 6) break;
    }
    return out;
  }, [anchor, gridStart]);

  const month = format(anchor, "yyyy-MM");

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/60">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <p key={d} className="label-caps px-2 py-1.5 text-[10px] text-muted-foreground">
              {d}
            </p>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((day) => {
              const inMonth = day.startsWith(month);
              const isToday = day === todayIso;
              const isPast = day < todayIso;
              const evs = eventsOn(day);
              return (
                <div
                  key={day}
                  className={cn(
                    "min-h-24 border-r p-1.5 last:border-r-0",
                    !inMonth && "bg-muted/40",
                    inMonth && isPast && "bg-muted/25",
                    isToday && "bg-brass/10 shadow-[inset_0_2px_0_0_hsl(var(--brass))]"
                  )}
                >
                  <p
                    className={cn(
                      "mb-1 text-right text-xs tabular-nums",
                      isToday
                        ? "font-bold text-brass"
                        : inMonth
                          ? isPast
                            ? "text-muted-foreground/70"
                            : "font-medium text-foreground"
                          : "text-muted-foreground/50"
                    )}
                  >
                    {Number(day.slice(-2))}
                  </p>
                  <div className="space-y-1">
                    {evs.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => onOpen(e)}
                        className={cn(
                          "block w-full truncate rounded-sm border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors duration-fast",
                          isPast
                            ? "border-l-border bg-muted/60 text-muted-foreground"
                            : isToday
                              ? "border-l-brass bg-card font-medium"
                              : "border-l-info bg-card"
                        )}
                        title={e.title}
                      >
                        <span className="tabular-nums">{format(new Date(e.starts_at), "HH:mm")}</span>{" "}
                        {e.title}
                      </button>
                    ))}
                    {evs.length > 3 && (
                      <button
                        onClick={() => onMore(day)}
                        className="w-full px-1.5 text-left text-[11px] font-medium text-brass hover:underline"
                      >
                        +{evs.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekGrid({
  start,
  todayIso,
  eventsOn,
  onOpen,
}: {
  start: Date;
  todayIso: string;
  eventsOn: (day: string) => CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i)));
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((d) => {
        const dayEvents = eventsOn(d);
        const isToday = d === todayIso;
        const isPast = d < todayIso;
        return (
          <div key={d} className="min-h-36">
            <p
              className={cn(
                "mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide",
                isToday ? "text-brass" : isPast ? "text-muted-foreground/60" : "text-muted-foreground"
              )}
            >
              {format(new Date(d + "T00:00:00"), "EEE d")}
              {isToday && " · today"}
            </p>
            <div
              className={cn(
                "space-y-1.5 rounded-lg p-1.5",
                isToday
                  ? "bg-brass/10 shadow-[inset_0_2px_0_0_hsl(var(--brass))]"
                  : isPast
                    ? "bg-muted/25"
                    : "bg-muted/40"
              )}
            >
              {dayEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onOpen(e)}
                  className={cn(
                    "w-full rounded-md border p-2 text-left text-xs transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isPast ? "bg-muted/60 text-muted-foreground" : "bg-card shadow-card"
                  )}
                >
                  <p className="font-semibold leading-tight">{e.title}</p>
                  <p className="mt-0.5 tabular-nums text-muted-foreground">
                    {format(new Date(e.starts_at), "HH:mm")}–
                    {format(new Date(e.ends_at), "HH:mm")}
                  </p>
                </button>
              ))}
              {dayEvents.length === 0 && (
                <p className="py-3 text-center text-[11px] text-muted-foreground">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NewEventDialog({
  people,
  onDone,
}: {
  people: { id: string; full_name: string }[];
  onDone: () => void;
}) {
  const api = useApi();
  const { userId } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start: "10:00",
    end: "11:00",
    location: "",
    description: "",
    attendees: [] as string[],
    external: "",
    emailInvites: true,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const external = form.external
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map((email) => ({ email }));
      const event = await api.comms.scheduleEvent({
        title: form.title,
        description: form.description || undefined,
        location: form.location || undefined,
        starts_at: `${form.date}T${form.start}:00`,
        ends_at: `${form.date}T${form.end}:00`,
        attendee_user_ids: form.attendees,
        external,
      });
      // Email the invite (with ICS) to external attendees — in-app, logged.
      if (form.emailInvites && external.length > 0) {
        await api.comms.sendEmail({
          to: external.map((e) => e.email),
          subject: `Invitation: ${form.title} — ${form.date} ${form.start}`,
          html: `<p>You're invited to <strong>${form.title}</strong>.</p>
                 <p>${form.date}, ${form.start}–${form.end}${form.location ? ` · ${form.location}` : ""}</p>
                 ${form.description ? `<p>${form.description}</p>` : ""}
                 <p>The attached invite adds it to your calendar.</p>`,
          event_id: event.id,
        });
      }
      return event;
    },
    onSuccess: onDone,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New event</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Title</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Date</Label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <div className="space-y-1">
            <Label>Start</Label>
            <Input
              type="time"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>End</Label>
            <Input
              type="time"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </div>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Location / meeting URL</Label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Internal attendees</Label>
          <div className="flex flex-wrap gap-1.5">
            {people
              .filter((p) => p.id !== userId)
              .map((p) => {
                const on = form.attendees.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        attendees: on
                          ? form.attendees.filter((a) => a !== p.id)
                          : [...form.attendees, p.id],
                      })
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {p.full_name}
                  </button>
                );
              })}
          </div>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>External attendees (emails)</Label>
          <Input
            value={form.external}
            onChange={(e) => setForm({ ...form, external: e.target.value })}
            placeholder="alice@client.com, bob@client.com"
          />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input
            id="email-invites"
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={form.emailInvites}
            onChange={(e) => setForm({ ...form, emailInvites: e.target.checked })}
          />
          <Label htmlFor="email-invites">
            Email calendar invites to external attendees
          </Label>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button
          disabled={!form.title || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? "Scheduling…" : "Schedule"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
