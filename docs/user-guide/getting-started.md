# Getting started (everyone)

ibrave OS is the company's single system of record: hours logged once flow
into approvals, invoices, payouts and margin — every number traceable to the
record that produced it. This page covers what every user needs regardless of
role; your role's guide covers the rest.

For a full map of who can access what, read the [Access model](../access-model.md).
For complete worked examples across every module, read [Feature workflows and
examples](../feature-workflows.md).

## Signing in

Open **https://os.ibrave.co**. Accounts are created by an admin — there is no
self-signup. You'll receive a one-time temporary password in person or over a
secure channel; **change it immediately** under Preferences → Password.

If your role requires two-factor authentication you'll be walked through
enrollment right after your first login: scan the QR code with any
authenticator app (Google Authenticator, 1Password, Authy…), enter the
6-digit code, done. From then on, logins ask for a current code.

External client contacts do not sign in through this internal workspace flow.
They are registered from a client record by the account team; see the
[Client portal guide](client-portal.md).

## Finding your way

- The **sidebar** shows only what your roles allow. If a section you expect is
  missing, ask an admin to check your roles — permissions are enforced by the
  server, so a missing menu is a permissions question, not a bug.
- The sidebar **collapses** (icon at the top) to an icon rail.
- **My Day** is your landing page: your cards depend on your role — unsubmitted
  hours, approvals waiting, overdue invoices, today's sales tasks.
- The number badge on My Day is your **unread notifications** count; it
  updates live.

## Preferences (the gear icon → Preferences)

| Section | What it does |
|---|---|
| Account | Your display name, title, timezone |
| Password | Change it any time; minimum 8 characters |
| Two-factor authentication | Enroll or remove your authenticator app. If MFA is mandated for you, removal is disabled |
| Appearance | Light/dark — follows you across devices |
| Notifications | Master switch for **email copies** of notifications. In-app notifications always arrive |

## Notifications and email

Anything that concerns you lands as an in-app notification (approvals,
rejections with reasons, payout confirmations, calendar invites, escalations…).
Once a day the system emails you a digest of what you haven't read — one email,
every unread item, never repeated. Turn the email leg off in Preferences if
the in-app feed is enough for you.

## Calendar and email — inside the app

Scheduling and outbound email happen **in** ibrave OS, on purpose: every
client-facing touch is recorded on the client/lead/candidate timeline.

- **Calendar**: schedule events with internal attendees (they're notified and
  see it in their calendar) and external guests (they receive a real `.ics`
  invite by email). Only the organizer can cancel.
- **Email composer** (on clients, leads, candidates, invoices): pick your From
  address — your own email, or a department identity like `talent@ibrave.co`
  if your role is entitled to it. There is no "noreply" for user-sent mail;
  replies go to you. Invoice emails can attach the official PDF.

## Client-facing access

Client contacts are managed separately from internal users:

```text
Clients -> <client> -> Client portal
```

Use that surface for client contacts, shared documents and approval requests.
Never ask an admin to create a client as an internal employee just so they can
see a document.

## The golden rules

1. **Log time in 0.25h steps** on the projects you're assigned to. If a
   project is missing from your timesheet, your assignment is missing — tell
   your PM.
2. **Submitted and approved records are locked.** Corrections go through the
   proper path (rejection back to draft, adjustment entries, credit notes) —
   never ask anyone to "just edit the database"; they can't.
3. **Everything is audited.** Workflow steps record who, when and why —
   comments on rejections/cancellations are mandatory because they become the
   record.
