import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function CalendarScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [weekStart, setWeekStart] = useState(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const from = `${weekStart}T00:00:00Z`;
  const to = `${format(addDays(new Date(weekStart), 7), "yyyy-MM-dd")}T00:00:00Z`;

  const { data: events } = useQuery({
    queryKey: ["calendar", weekStart],
    queryFn: () => api.comms.events(from, to),
  });
  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.talent.people(),
  });

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        format(addDays(new Date(weekStart), i), "yyyy-MM-dd")
      ),
    [weekStart]
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["calendar"] });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.comms.cancelEvent(id),
    onSuccess: () => {
      setSelected(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Calendar</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Meetings, check-ins and interviews — scheduled here, invites emailed with a
            proper calendar attachment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous week"
            onClick={() => setWeekStart(format(addDays(new Date(weekStart), -7), "yyyy-MM-dd"))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium">
            Week of {weekStart}
          </span>
          <Button variant="outline" size="icon" aria-label="Next week"
            onClick={() => setWeekStart(format(addDays(new Date(weekStart), 7), "yyyy-MM-dd"))}>
            <ChevronRight className="h-4 w-4" />
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

      <div className="grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const dayEvents = (events ?? []).filter(
            (e) => e.starts_at.slice(0, 10) === d
          );
          const isToday = d === format(new Date(), "yyyy-MM-dd");
          return (
            <div key={d} className="min-h-36">
              <p
                className={cn(
                  "mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}
              >
                {format(new Date(d + "T00:00:00"), "EEE d")}
                {isToday && " · today"}
              </p>
              <div
                className={cn(
                  "space-y-1.5 rounded-lg p-1.5",
                  isToday ? "bg-accent/60" : "bg-muted/40"
                )}
              >
                {dayEvents.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className="w-full rounded-md border bg-card p-2 text-left text-xs shadow-card transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
