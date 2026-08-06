# Owner & Admin guide — oversight and administration

Owner and admin implicitly hold every other role's powers; this guide covers
what is *exclusively* theirs.

## Command Center (owner)

The company on one screen, every number clickable through to its source
records — if a tile can't be drilled into, it isn't trusted, and that's the
design principle.

- **Pulse tiles**: overdue AR, unbilled work, collected/issued/margin MTD,
  utilization, unsubmitted people, open requisitions and escalations, red/
  yellow accounts, upsell pipeline. Alarming tiles change state visually.
- **Live feed**: deals won, invoices issued/paid, hires, escalations — in
  real time, each linking to the record.
- **Engagement board**: every active client engagement with its margin.
- **Two-sided pipeline**: demand (weighted deals needing people) against
  supply (bench capacity) per month — the single chart that says *hire* or
  *sell*.
- **Alert rules**: thresholds (e.g. overdue AR > X, utilization < Y%) that
  notify you when crossed, evaluated daily.

## Admin — People (the user lifecycle)

All user management happens here, never in the Supabase dashboard.

| Action | Notes |
|---|---|
| **Add person** | Creates the login immediately; you get a **one-time temporary password** — hand it over securely, it's never emailed and never shown again |
| **Roles** | Grant/revoke chips per the [role matrix](../role-matrix.md). Multiple roles are normal (PM + resourcing) |
| **Edit** | Name, title, employee/contractor, weekly capacity, **Require MFA** |
| **Reset password** | New one-time password, same handover rules |
| **Deactivate** | Blocks login (auth-level ban) and flags the profile. All history is kept — there is deliberately no delete. You cannot deactivate yourself |

Everything writes `audit_log`.

## Admin — Security (MFA policy)

MFA (authenticator apps) is **off by default**. Mandate it:

- **Per role** — Company settings → Security: toggle the roles that must
  enroll (recommended baseline: finance, admin, owner).
- **Per person** — People → edit → Require MFA.

Mandated users are gated into enrollment at their next login and cannot
remove their factor. Lost device: reset their password and clear the factor
(currently via Supabase dashboard → Auth → the user's factors — see the
[operations runbook](../operations-runbook.md#9-auth-users-and-mfa-operations)).

## Admin — Email identities

Department From-addresses (`talent@ibrave.co`, `billing@ibrave.co`…) with the
roles allowed to use each. The server validates every send against this list
— users can otherwise only send as themselves. User mail is never "noreply".

## Admin — Company settings

Fills the invoice template (legal name, address, TIN, registration, bank
details, VAT note, issuer) and sets numbering prefixes (`INV`/`CN`) and the
base currency. Changes apply to future invoices only — issued ones are
frozen with the values they were born with.

## Owner habits that keep the system honest

- Chase the **unsubmitted people** tile weekly — everything downstream
  (billing, payouts, margin) starves without hours.
- Read **loss reasons** and **health factors** monthly; they're the two
  cheapest strategy inputs the system produces.
- Never ask anyone to bypass a workflow "just this once" — the guards will
  refuse, and the audit trail is the point.
