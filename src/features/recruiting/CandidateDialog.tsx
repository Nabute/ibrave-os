import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarPlus, Mail, Star } from "lucide-react";
import { useState } from "react";

import { EmailComposer } from "@/components/EmailComposer";
import { WorkspaceActions } from "@/components/WorkspaceActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  actionList,
  toDisplayMessage,
  type Candidate,
  type InterviewRound,
  type WorkflowAction,
} from "@/lib/api";
import { formatMinor, parseToMinor } from "@/lib/money";
import { useApi, useSession } from "@/lib/session";
import { CANDIDATE_BADGE } from "./RecruitingScreen";

/** Candidate workspace: HATEOAS stage actions, interview rounds + scorecards,
 *  offers, in-app email, in-app interview scheduling, the hire wizard. */
export function CandidateDialog({
  candidate,
  onClose,
}: {
  candidate: Candidate;
  onClose: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [offering, setOffering] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [scheduling, setScheduling] = useState<InterviewRound | null>(null);

  const { data: actions } = useQuery({
    queryKey: ["candidate-actions", candidate.id, candidate.stage],
    queryFn: () => api.talent.candidateActions(candidate.id),
  });
  const { data: rounds } = useQuery({
    queryKey: ["candidate-rounds", candidate.id],
    queryFn: () => api.talent.rounds(candidate.id),
  });
  const { data: offers } = useQuery({
    queryKey: ["candidate-offers", candidate.id],
    queryFn: () => api.talent.offers(candidate.id),
  });
  const { data: activities } = useQuery({
    queryKey: ["candidate-activities", candidate.id],
    queryFn: () => api.talent.activities(candidate.id),
  });

  const invalidate = () => {
    ["candidates", "candidate-actions", "candidate-rounds", "candidate-offers",
     "candidate-activities", "requisitions", "onboarding", "recruiting-funnel"].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] })
    );
  };

  const actionMutation = useMutation({
    mutationFn: ({ action, comment }: { action: string; comment?: string }) =>
      api.talent.candidateAction(candidate.id, action, comment),
    onSuccess: () => {
      setRejecting(false);
      setError(null);
      invalidate();
      onClose();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const hireMutation = useMutation({
    mutationFn: () => api.talent.hire(candidate.id),
    onSuccess: () => {
      setError(null);
      invalidate();
      onClose();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const onAction = (a: WorkflowAction) => {
    if (a.action === "hire") hireMutation.mutate();
    else if (a.action === "offer") setOffering(true);
    else if (a.requires_comment) setRejecting(true);
    else actionMutation.mutate({ action: a.action });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Ledger dialog workspace: 880px, header rule, scrolling body, sticky
          action footer (≤1 primary + ghosts, overflow → More). */}
      <DialogContent className="flex max-h-[85vh] w-[880px] max-w-[92vw] flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-3 font-display text-2xl font-normal">
            {candidate.full_name}
            <Badge variant={CANDIDATE_BADGE[candidate.stage]}>
              {candidate.stage.replace("_", " ")}
            </Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {candidate.email} · {candidate.skills.join(", ")}
            {candidate.seniority && ` · ${candidate.seniority}`}
            {candidate.expected_rate_minor != null &&
              ` · expects ${formatMinor(candidate.expected_rate_minor, "USD")}/h`}
            {candidate.available_from && ` · available ${candidate.available_from}`}
          </p>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <RoundsSection
          candidate={candidate}
          rounds={rounds ?? []}
          onChanged={invalidate}
          onError={setError}
          onSchedule={setScheduling}
        />

        {(offers ?? []).length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-sm font-semibold">Offers</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {(offers ?? []).map((o) => (
                  <li key={o.id}>
                    {formatMinor(o.rate_minor, "USD")}/{o.rate_period}
                    {o.start_date && `, starting ${o.start_date}`} —{" "}
                    <Badge
                      variant={
                        o.status === "accepted"
                          ? "success"
                          : o.status === "declined"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {o.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <Separator />
        <div>
          <p className="mb-1.5 text-sm font-semibold">Activity</p>
          <ul className="space-y-1.5 text-sm">
            {(activities ?? []).slice(0, 8).map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(a.at).toLocaleDateString()}
                </span>
                <span className="text-muted-foreground">{a.body}</span>
              </li>
            ))}
          </ul>
        </div>
        </div>

        <WorkspaceActions
          actions={actionList(actions)}
          onAction={onAction}
          primaryAction="hire"
          busy={actionMutation.isPending || hireMutation.isPending}
          extra={
            candidate.email ? (
              <Button size="sm" variant="ghost" onClick={() => setEmailing(true)}>
                <Mail className="h-4 w-4" /> Email
              </Button>
            ) : undefined
          }
        />

        {/* Reject dialog */}
        <Dialog open={rejecting} onOpenChange={setRejecting}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject candidate</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="Reason (required — shared honestly, kept internally)"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={rejectComment.trim() === "" || actionMutation.isPending}
                onClick={() =>
                  actionMutation.mutate({ action: "reject", comment: rejectComment })
                }
              >
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {offering && (
          <OfferDialog
            candidate={candidate}
            onClose={() => setOffering(false)}
            onDone={() => {
              setOffering(false);
              invalidate();
            }}
          />
        )}

        {scheduling && (
          <ScheduleInterviewDialog
            candidate={candidate}
            round={scheduling}
            onClose={() => setScheduling(null)}
            onDone={() => {
              setScheduling(null);
              invalidate();
            }}
          />
        )}

        <EmailComposer
          open={emailing}
          onClose={() => setEmailing(false)}
          to={candidate.email ? [candidate.email] : []}
          templateVars={{
            candidate_name: candidate.full_name,
            role_title: candidate.requisitions?.role_title ?? "an engineering role",
          }}
          subject={`ibrave — next steps`}
          related={{ candidate_id: candidate.id }}
          onSent={invalidate}
        />
      </DialogContent>
    </Dialog>
  );
}

function RoundsSection({
  candidate,
  rounds,
  onChanged,
  onError,
  onSchedule,
}: {
  candidate: Candidate;
  rounds: InterviewRound[];
  onChanged: () => void;
  onError: (m: string) => void;
  onSchedule: (r: InterviewRound) => void;
}) {
  const api = useApi();
  const { userId } = useSession();
  const [interviewerId, setInterviewerId] = useState("");
  const [scoringRound, setScoringRound] = useState<InterviewRound | null>(null);

  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.talent.people(),
  });

  const addRound = useMutation({
    mutationFn: () =>
      api.talent.addRound(candidate.id, rounds.length + 1, interviewerId),
    onSuccess: () => {
      setInterviewerId("");
      onChanged();
    },
    onError: (e) => onError(toDisplayMessage(e)),
  });

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">Interview rounds</p>
      <ul className="space-y-2">
        {rounds.map((r) => (
          <li key={r.id} className="rounded-lg border p-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                R{r.round_no} · {r.profiles?.full_name}
                {r.scheduled_at &&
                  ` · ${format(new Date(r.scheduled_at), "MMM d HH:mm")}`}
              </span>
              <div className="flex items-center gap-1.5">
                {r.submitted_at ? (
                  <Badge
                    variant={
                      r.recommendation?.includes("yes") ? "success" : "destructive"
                    }
                  >
                    {r.recommendation?.replace("_", " ")}
                  </Badge>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSchedule(r)}
                      title="Schedule in-app; invite emailed with calendar attachment"
                    >
                      <CalendarPlus className="h-4 w-4" /> Schedule
                    </Button>
                    {r.interviewer_id === userId && (
                      <Button variant="outline" size="sm" onClick={() => setScoringRound(r)}>
                        Scorecard
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            {r.scorecard && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {r.scorecard.map((s, i) => (
                  <li key={i}>
                    {s.criterion}: {"★".repeat(s.score_1_5)} {s.notes && `— ${s.notes}`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Select value={interviewerId} onValueChange={setInterviewerId}>
          <SelectTrigger className="h-9 w-56">
            <SelectValue placeholder="Add round: interviewer…" />
          </SelectTrigger>
          <SelectContent>
            {(people ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={!interviewerId || addRound.isPending}
          onClick={() => addRound.mutate()}
        >
          Add round
        </Button>
      </div>

      {scoringRound && (
        <ScorecardDialog
          round={scoringRound}
          onClose={() => setScoringRound(null)}
          onDone={() => {
            setScoringRound(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ScorecardDialog({
  round,
  onClose,
  onDone,
}: {
  round: InterviewRound;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState([
    { criterion: "Problem solving", score_1_5: 0, notes: "" },
    { criterion: "Technical depth", score_1_5: 0, notes: "" },
    { criterion: "Communication", score_1_5: 0, notes: "" },
  ]);
  const [recommendation, setRecommendation] = useState("");

  const submitMutation = useMutation({
    mutationFn: () =>
      api.talent.submitScorecard(
        round.id,
        rows.filter((r) => r.score_1_5 > 0),
        recommendation
      ),
    onSuccess: onDone,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scorecard — round {round.round_no}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>{row.criterion}</Label>
                <div className="flex gap-0.5" role="radiogroup" aria-label={row.criterion}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={row.score_1_5 === n}
                      aria-label={`${n} of 5`}
                      onClick={() =>
                        setRows(rows.map((r, j) => (j === i ? { ...r, score_1_5: n } : r)))
                      }
                      className="rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Star
                        className={
                          n <= row.score_1_5
                            ? "h-4 w-4 fill-warning-foreground text-warning-foreground"
                            : "h-4 w-4 text-muted-foreground"
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>
              <Input
                placeholder="Notes"
                value={row.notes}
                onChange={(e) =>
                  setRows(rows.map((r, j) => (j === i ? { ...r, notes: e.target.value } : r)))
                }
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label>Recommendation</Label>
            <Select value={recommendation} onValueChange={setRecommendation}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {["strong_yes", "yes", "no", "strong_no"].map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            disabled={
              !recommendation ||
              rows.every((r) => r.score_1_5 === 0) ||
              submitMutation.isPending
            }
            onClick={() => submitMutation.mutate()}
          >
            Submit scorecard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferDialog({
  candidate,
  onClose,
  onDone,
}: {
  candidate: Candidate;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    rate: candidate.expected_rate_minor
      ? String(candidate.expected_rate_minor / 100)
      : "",
    period: "hourly",
    start: candidate.available_from ?? "",
  });

  const offerMutation = useMutation({
    mutationFn: () => {
      const minor = parseToMinor(form.rate);
      if (minor == null) throw new Error("Enter a valid rate");
      return api.talent.recordOffer(
        candidate.id,
        minor,
        form.period as "hourly" | "monthly",
        form.start || null
      );
    },
    onSuccess: onDone,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record offer — {candidate.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Rate (USD)</Label>
            <Input
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Period</Label>
            <Select
              value={form.period}
              onValueChange={(v) => setForm({ ...form, period: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">hourly</SelectItem>
                <SelectItem value="monthly">monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Start date</Label>
            <Input
              type="date"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            disabled={!form.rate || offerMutation.isPending}
            onClick={() => offerMutation.mutate()}
          >
            Record offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** In-app interview scheduling: calendar event linked to the round; candidate
 *  gets the invite (ICS) by email — nobody opens an external calendar. */
function ScheduleInterviewDialog({
  candidate,
  round,
  onClose,
  onDone,
}: {
  candidate: Candidate;
  round: InterviewRound;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: format(new Date(Date.now() + 2 * 86_400_000), "yyyy-MM-dd"),
    start: "10:00",
    end: "11:00",
    location: "",
    emailCandidate: true,
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const event = await api.comms.scheduleEvent({
        title: `Interview R${round.round_no}: ${candidate.full_name}`,
        location: form.location || undefined,
        starts_at: `${form.date}T${form.start}:00`,
        ends_at: `${form.date}T${form.end}:00`,
        attendee_user_ids: [round.interviewer_id],
        external: candidate.email
          ? [{ email: candidate.email, name: candidate.full_name }]
          : [],
        candidate_id: candidate.id,
        interview_round_id: round.id,
      });
      if (form.emailCandidate && candidate.email) {
        await api.comms.sendEmail({
          to: [candidate.email],
          subject: `Interview with ibrave — ${form.date} ${form.start}`,
          html: `<p>Hi ${candidate.full_name.split(" ")[0]},</p>
                 <p>Your interview (round ${round.round_no}) is scheduled for
                 <strong>${form.date}, ${form.start}–${form.end}</strong>${
                   form.location ? ` · ${form.location}` : ""
                 }.</p><p>The attached invite adds it to your calendar. Looking forward!</p>`,
          candidate_id: candidate.id,
          event_id: event.id,
        });
      }
      return event;
    },
    onSuccess: onDone,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule interview — round {round.round_no}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
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
          <div className="col-span-3 space-y-1">
            <Label>Location / meeting URL</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          {candidate.email && (
            <div className="col-span-3 flex items-center gap-2">
              <input
                id="email-candidate"
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={form.emailCandidate}
                onChange={(e) => setForm({ ...form, emailCandidate: e.target.checked })}
              />
              <Label htmlFor="email-candidate">
                Email the candidate a calendar invite
              </Label>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            disabled={scheduleMutation.isPending}
            onClick={() => scheduleMutation.mutate()}
          >
            {scheduleMutation.isPending ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
