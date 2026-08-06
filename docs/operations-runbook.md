# ibrave OS — Operations Runbook

The authoritative reference for running ibrave OS in production: architecture,
environments, deploys, migrations, background jobs, secrets, auth/MFA
operations, backup and recovery, monitoring, and incident playbooks.

When code and this page disagree, **the repo wins** — update this runbook.
Sources of truth: `supabase/migrations/` (schema, RLS, RPCs, cron),
`supabase/functions/` (Edge Functions), `supabase/config.toml` (auth + local
stack), `vercel.json` (hosting), `tests/validation/` (executable behavior
checks), [role-matrix.md](role-matrix.md) (permissions).

## Contents

1. [System at a glance](#1-system-at-a-glance)
2. [Architecture](#2-architecture)
3. [Environments](#3-environments)
4. [Frontend deploys (Vercel)](#4-frontend-deploys-vercel)
5. [Database changes (migrations)](#5-database-changes-migrations)
6. [Edge Functions](#6-edge-functions)
7. [Background jobs (cron)](#7-background-jobs-cron)
8. [Secrets and configuration](#8-secrets-and-configuration)
9. [Auth, users and MFA operations](#9-auth-users-and-mfa-operations)
10. [Email delivery](#10-email-delivery)
11. [Backups and disaster recovery](#11-backups-and-disaster-recovery)
12. [Monitoring and health checks](#12-monitoring-and-health-checks)
13. [Incident playbooks](#13-incident-playbooks)
14. [The validation suite](#14-the-validation-suite)
15. [Go-live readiness checklist](#15-go-live-readiness-checklist)

---

## 1. System at a glance

| Layer | What | Where |
|---|---|---|
| Frontend | Vite + React SPA, code-split per screen | Vercel → `https://os.ibrave.co` |
| Backend | Supabase (Postgres + Auth + Edge Functions + Realtime) | project `zdhkcfjvywthesafbaov` |
| Business logic | Postgres RPCs + declarative FSM + RLS — the DB is the enforcement point | `supabase/migrations/` |
| Email | Resend, called only from Edge Functions | secrets in Supabase dashboard |
| Jobs | `pg_cron` (SQL jobs directly; Edge Functions via `pg_net`) | scheduled in migrations |
| Repo | `github.com/Nabute/ibrave-os` — pushing `main` auto-deploys the frontend | Vercel Git integration |

Three invariants shape all operations:

1. **Schema changes only through migrations.** Never edit schema in the
   dashboard; the migration chain must replay from zero (`supabase db reset`).
2. **Financial state changes only through RPCs.** Guard triggers reject direct
   status writes; approved entries, issued invoices and payments are immutable
   or append-only. There is no "quick UPDATE in the SQL editor" for money —
   corrections are adjustment entries and credit notes.
3. **`service_role` never leaves Edge Functions.** The frontend holds only the
   anon key; user identity and roles are re-checked server-side on every call.

## 2. Architecture

```
Browser (React SPA, anon key + user JWT)
  │  PostgREST reads (RLS-filtered)      ──►  Postgres
  │  RPC calls (business actions)        ──►    ├─ workflow_transitions (FSM data)
  │  Realtime (notifications feed)       ──►    ├─ fsm_transition() guard
  │  functions.invoke (JWT forwarded)    ──►    ├─ RLS on every table
  │                                             └─ audit_log / workflow_history
  └─►  Edge Functions (Deno, service_role inside only)
        ├─ send-user-email   user-initiated mail; From validated server-side
        ├─ admin-users       invite / deactivate / reset password (admin-gated)
        ├─ reminders         SQL jobs + per-user notification email digest
        └─ dunning           invoice reminder ladder (reads dunning_queue())
```

Key mechanics an operator must know:

- **FSM**: allowed transitions live in the `workflow_transitions` *table*.
  Adding a workflow step is an INSERT (via migration), not code. Every
  transition writes `workflow_history`; every sensitive action writes
  `audit_log` (actor, action, entity, diff).
- **`app.via_rpc`**: a transaction-local flag set by RPCs. Guard triggers
  reject status/financial writes when it is absent — this is why ad-hoc SQL
  UPDATEs on invoices/entries fail, by design.
- **HATEOAS actions**: screens render buttons from `*_actions()` RPCs. If a
  button is "missing" for a user, that is the FSM/role model working — check
  [role-matrix.md](role-matrix.md) before treating it as a bug.
- **Numbering**: invoices are `INV-{CLIENTCODE}-{YYYY}-{NNNN}`, counted per
  client per year (`invoice_counters`, claimed atomically at issue). Credit
  notes use the `CN-` prefix. Gaps can only appear if issuance fails after
  claiming — check `audit_log` before assuming data loss.

## 3. Environments

| | Local | Hosted (current) | Production (target) |
|---|---|---|---|
| Supabase | `supabase start` (Docker) | `zdhkcfjvywthesafbaov` | *to be created* |
| Frontend | `npm run dev -- --port 5199 --strictPort` | os.ibrave.co (Vercel) | os.ibrave.co |
| Data | `seed.sql` demo data | demo + validation data (VTST client) | real data only |
| Email | logged, not sent (no `RESEND_API_KEY`) | Resend | Resend, verified domain |

- Port **5199** locally — 5173/5174 belong to other projects on the dev machine.
- The hosted project currently doubles as staging. Before real invoices:
  create a clean production project, `supabase link` to it, replay migrations
  (`supabase db push`), push config (`supabase config push`), deploy functions,
  set secrets, and repoint Vercel's env vars. Keep the current project as
  staging. **Move production to the Pro plan** — the free tier pauses after ~1
  week idle and has no point-in-time recovery.
- `.env.local` must stay strict `KEY=VALUE` — the Supabase CLI parses it and
  fails on shell-style lines.

## 4. Frontend deploys (Vercel)

Deploys are Git-driven: **pushing `main` deploys production**. There is no
build step to run manually.

- `vercel.json` provides the SPA fallback (every path rewrites to
  `index.html` — deep links like `/invoices/<id>` would otherwise 404 on
  refresh) and cache headers (hashed assets immutable for 1 year;
  `index.html` no-cache so releases propagate immediately).
- Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are
  set in the Vercel project. They are **baked into the bundle at build time**
  — changing them requires a redeploy, and they are public by design (the anon
  key is safe to expose; RLS is the security boundary).
- **Verify a deploy**: load `https://os.ibrave.co/timesheet` directly (must be
  200, not 404), sign in, check the browser console for errors.
- **Rollback**: Vercel dashboard → Deployments → previous deployment →
  "Promote to Production". Database rollbacks are separate (section 5) — the
  frontend is forward/backward compatible with adjacent schema versions as
  long as generated types match; when in doubt roll both back together.

## 5. Database changes (migrations)

```bash
supabase migration new <name>       # create supabase/migrations/<ts>_<name>.sql
supabase db reset                   # replay ALL migrations + seed locally — must pass
node tests/validation/v0-foundation.mjs   # spot-check if the change touches security
supabase db push                    # apply to the linked (hosted) project
supabase gen types typescript --linked > src/types/database.ts
git commit && git push              # frontend deploy picks up type changes
```

Rules that keep the chain healthy:

- A migration that creates a table **must** enable RLS and define policies in
  the same file. New status-bearing entities need a guard trigger and
  `workflow_transitions` rows.
- Migrations must be **replayable from zero** — `supabase db reset` is the
  gate before every push. Data repairs live in migrations too (see
  `..._record_payment_guards.sql` for the pattern, including temporarily
  disabling an append-only trigger for a surgical fix).
- **There is no `migration down`.** Rollback = a new forward migration that
  reverses the change. For bad *data*, prefer the system's own correction
  paths (credit notes, adjustment entries) over UPDATEs.
- FK tip learned twice (migrations 26, 32): tables referenced by PostgREST
  *embeds* must FK to `public.profiles`, not `auth.users` — PostgREST can
  only walk FKs it can see, and a wrong target fails only at query time.

## 6. Edge Functions

| Function | Auth | Purpose |
|---|---|---|
| `send-user-email` | user JWT (gateway-verified) | All user-initiated email. Validates the From against `can_use_email_identity()`, logs to `email_log`, mirrors to entity timelines, attaches ICS invites / invoice PDFs |
| `admin-users` | user JWT + admin/owner re-check | Create auth users (one-time temp password), deactivate (auth ban + profile flag), reset passwords. Writes `audit_log` |
| `reminders` | `CRON_SECRET` bearer | Runs `job_timesheet_reminders` + `job_approval_nudges`, then emails **one digest per user** of unread notifications — each notification exactly once (`emailed_at`), honoring the user's email preference |
| `dunning` | `CRON_SECRET` bearer | Emails the invoice reminder ladder from `dunning_queue()` |

Deploy after changing code:

```bash
supabase functions deploy send-user-email
supabase functions deploy admin-users
supabase functions deploy reminders --no-verify-jwt   # cron secret is the gate
supabase functions deploy dunning   --no-verify-jwt
```

The `--no-verify-jwt` flag is required for the cron-invoked pair (the gateway
would otherwise reject the non-JWT cron secret). Their own `authorize()` check
is the actual gate. Manual invocation (testing):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/reminders" \
  -H "Authorization: Bearer $CRON_SECRET"
# → {"reminded":0,"nudged":0,"emailed":N,"skipped":0}
```

Safe to run repeatedly: SQL jobs are day-idempotent (`automation_runs`
run_key), the digest is exactly-once per notification.

## 7. Background jobs (cron)

All schedules are UTC, defined in migrations (`select cron.schedule(...)`).

| Job | Schedule | What it does |
|---|---|---|
| `dunning-scan` | 05:00 daily | Flips past-due invoices to `overdue`; queues dunning stages |
| `edge-dunning` | 05:15 daily | Emails the dunning ladder (courtesy at due−3; overdue at +7/+14/+30). Courtesy always sends; overdue stages pause while an escalation is open or `dunning_paused` |
| `renewal-watchdog` | 05:30 daily | Expires ended contracts; notifies sales/owner at 60 and 30 days before end |
| `account-health` | 05:45 daily | Recomputes explainable health scores; notifies on red |
| `timesheet-reminders` | 06:00 Mon | In-app reminders for unsubmitted weeks |
| `approval-nudges` | 06:00 daily | Nudges PMs with pending approvals |
| `candidate-idle-nudge` | 06:10 daily | Nudges recruiters about stalled candidates |
| `edge-reminders` | 06:15 Mon | Email leg of the Monday reminders |
| `account-checkins` | 06:00 daily | Creates check-in tasks for account owners |
| `edge-notify-digest` | 07:00 daily | Per-user email digest of all unread, un-emailed notifications |

Every job writes `automation_runs (job, run_key, detail)` — the first place to
look when "the emails didn't go out":

```sql
select * from automation_runs order by started_at desc limit 20;
```

A `unique_violation` skip (run 0) means the job already ran that day — by
design, not a failure.

## 8. Secrets and configuration

| Secret | Lives in | Used by | Rotation |
|---|---|---|---|
| `RESEND_API_KEY` | Supabase → Edge Function secrets | all mail-sending functions | Resend dashboard → new key → `supabase secrets set` → no redeploy needed |
| `EMAIL_FROM` | Edge Function secrets | system mail fallback (`ibrave OS <noreply@ibrave.co>`) | edit any time |
| `CRON_SECRET` | Edge Function secrets **and** Postgres Vault (used by `invoke_edge_function()`) | cron→function auth | rotate in **both** places in one sitting |
| `APP_URL` | Edge Function secrets | links inside emails (`https://os.ibrave.co`) | edit on domain change |
| `service_role` key | Supabase-managed, auto-injected into functions | admin operations | Supabase dashboard rotation |
| anon key | Vercel env + `.env.local` | frontend | rotate in dashboard, update both, redeploy |
| DB password | password manager | direct psql (rarely needed) | **rotate now** — the original passed through an insecure channel during setup |

Auth config (site URL, redirect allowlist, JWT expiry) lives in
`supabase/config.toml` `[auth]` and is applied with `supabase config push`.
The site URL must stay `https://os.ibrave.co` or password-reset emails will
link to the wrong place.

Network note (dev machine): the direct DB hostname is IPv6-only and does not
resolve from this network. Use the CLI (`supabase db push`), PostgREST with a
user JWT, or Edge Functions — not raw psql to the hosted DB.

## 9. Auth, users and MFA operations

**All user lifecycle runs in-app (Admin → People)** — never create users in the
Supabase dashboard (the profile trigger would fire but roles, employment type
and audit trail would be missing).

| Task | How |
|---|---|
| Onboard a person | Admin → People → **Add person** (name, email, title, type, roles) → hand over the one-time temp password over a secure channel → they change it in Preferences |
| Offboard | **Deactivate** — bans the auth account (login impossible) and flags the profile. History (time, invoices, payouts) is retained; never delete |
| Forgotten password | **Reset password** (key icon) → new one-time password |
| Role change | Grant/revoke chips on the People row — effective on the user's next data fetch |
| Lost MFA device | Currently: reset their password **and** clear their TOTP factor via the Supabase dashboard (Auth → user → factors) — an `admin-users` action for this is a known gap |
| Mandate MFA | Per role: Admin → Company settings → Security. Per person: People → edit → "Require MFA". Off by default; mandated users are gated to enrollment at next login |

MFA is TOTP-only (authenticator apps). Enforcement is at the app gate (AAL2
step-up); database-level AAL2 policies are a hardening option, not yet applied.

## 10. Email delivery

Three distinct paths — know which one is misbehaving before debugging:

1. **User-initiated** (`send-user-email`): composer in the UI; From must be
   the user's own address or a department identity their role allows
   (`email_identities`, managed in Admin). Logged in `email_log` and the
   entity timeline.
2. **Dunning** (`dunning` fn): client-facing invoice reminders to the billing
   contact (falls back to the client's `contact_email`).
3. **Digest** (`reminders` fn): internal notification digests, exactly-once,
   suppressed by the user's Preferences switch and for deactivated users.

Prerequisite: **`ibrave.co` must be a verified domain in Resend** — until it
is, sends fail (visible in function logs) or land in spam. Demo `@ibrave.dev`
recipients always bounce; that is expected in staging.

## 11. Backups and disaster recovery

- **Production must run on Supabase Pro** with Point-in-Time Recovery. Free
  tier = daily snapshot only, 7-day retention, and idle-pausing.
- The **schema** needs no backup — it is the migration chain in git. A new
  project + `supabase db push` reproduces it exactly (validated: 33
  migrations replay clean from zero).
- **Data** restore: Supabase dashboard → Database → Backups (or PITR to a
  timestamp on Pro). After any restore, re-run the validation suite
  (section 14) before letting users back in.
- **Auth users** are inside the same Postgres cluster and restore with it.
- Periodically (monthly) take a logical export as an off-platform belt:
  `supabase db dump -f backup-$(date +%F).sql` — store encrypted, off-site.
- Edge Function code, cron schedules, auth config: all in the repo — nothing
  to back up, everything to `git push`.

## 12. Monitoring and health checks

Daily glance (2 minutes):

1. **Command Center** (owner): the pulse tiles *are* the business health
   check — overdue AR, unbilled, unsubmitted people, escalations.
2. **`automation_runs`**: every scheduled job should have today's run_key.
3. **Edge Function logs** (dashboard → Functions → Logs): Resend errors
   surface here and nowhere else.

Weekly:

- Reports → Accounting: the export must balance (debits = credits) — it is
  computed from live data, so an imbalance means a bug, not bad bookkeeping.
- Payouts → reconciliation view: `unpaid_hours` should trend to zero after
  each payout cycle; `missing_cost_rate = true` rows mean margin is wrong for
  that person — add a cost rate.
- Vercel → Analytics/Logs for frontend errors (or wire Sentry — open item).

## 13. Incident playbooks

**"I refresh and get a 404."** The SPA rewrite is missing — confirm
`vercel.json` is in the deployed commit; redeploy. (Fixed permanently; only
recurs if `vercel.json` is deleted.)

**"Nobody is receiving emails."** In order: (1) function logs for Resend
errors — key revoked? domain unverified? (2) `automation_runs` — did the cron
fire? (3) `select count(*) from notifications where emailed_at is null and
read_at is null` — a growing number with no function errors means the cron→
function leg is broken: check `CRON_SECRET` matches between Vault and function
secrets. (4) The recipient's Preferences → email switch.

**"A user can't log in."** Check Admin → People: deactivated? If MFA-gated
with a lost device: section 9. If *everyone* is locked out: Supabase status
page first, then Auth logs in the dashboard.

**"An invoice is wrong."** Never edit it. Draft → edit lines freely or
`delete_draft`. Issued → `create_credit_note` (partial correction) or
`void_invoice` + regenerate (the entries stay stamped on void by design —
credit note is usually what you want). Wrong payment → payments are
append-only; offset with a credit note and document in the note field.

**"Dunning mailed a client we're negotiating with."** Open an escalation on
the client (pauses all overdue-stage dunning automatically) or toggle "Pause
dunning" on the specific invoice. Courtesy (due−3) reminders still send by
design.

**"A job ran twice / didn't run."** `automation_runs` is the truth. Ran-twice
is impossible for the same run_key (unique). Didn't-run: check `cron.job` and
`cron.job_run_details` (SQL editor), then pg_net responses for the edge-invoke
jobs.

**"Someone deleted/changed something they shouldn't."** `audit_log` has
actor, action, entity and diff for every sensitive write; `workflow_history`
has every state transition with comments. Both are append-only.

## 14. The validation suite

`tests/validation/` — ~270 executable checks that sign in as each role and
drive the real RPCs. Run after every schema change, before go-live, after any
restore:

```bash
cd apps/outsourcing-platform
for f in tests/validation/v*.mjs; do node "$f" || echo "FAILED: $f"; done
```

Caveats: targets whatever `.env.local` points at (never point it at
production with real data — it creates test records under the `VTST` client);
`v2-billing` advances invoice numbering per run; `v10-mfa` needs the dev
server on :5199 + Playwright and enrolls a TOTP factor for the test user.

## 15. Go-live readiness checklist

- [ ] Production Supabase project created, **Pro plan**, PITR enabled
- [ ] 33+ migrations pushed; `supabase config push` applied; functions deployed; secrets set (fresh `CRON_SECRET`, prod `APP_URL`)
- [ ] Vercel env repointed at the production project; deploy verified (deep-link 200, login works)
- [ ] `ibrave.co` verified in Resend; test send to a real mailbox from the composer, dunning, and digest paths
- [ ] DB password rotated; old chat-exposed password dead
- [ ] Demo users removed / real staff invited via Admin → People; roles per [role-matrix.md](role-matrix.md)
- [ ] MFA mandated for finance/admin/owner (recommended baseline)
- [ ] Company settings completed (legal name, TIN, bank details, invoice prefix — they print on invoices)
- [ ] Real clients entered with correct **invoice codes** (they become part of invoice numbers — hard to change later), terms, timezones, billing contacts
- [ ] Rate cards + cost rates for every billable person (missing cost rate = wrong margin, flagged in reconciliation)
- [ ] Validation suite green against production *before* real data entry
- [ ] First real cycle shadowed: one timesheet week → approve → invoice → send — verified by a human before trusting automation
