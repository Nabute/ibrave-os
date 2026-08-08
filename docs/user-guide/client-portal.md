# Client portal guide

This guide is for account owners, PMs, finance and admins who prepare
client-facing access. It describes the current client portal administration
surface and the rules for external client contacts.

## Who counts as a client portal user

A client portal user is an external person at the client company: billing
contact, technical contact, decision maker, champion, approver or sponsor.

Client portal users are not internal workspace users. They should not be
created from **Admin -> People**, and they should not receive internal roles.

## Where to manage client access

Open:

```text
Clients -> <client> -> Client portal
```

The tab has three sections.

| Section | Purpose |
|---|---|
| Portal users | Register the client-side people who should receive or later access client-facing records |
| Documents | Register shared documents such as SOWs, reports, contracts, status packs or invoice support |
| Approval requests | Track client decisions such as approving timesheets, delivery scope, invoices or documents |

## Add a client contact

1. Open the client record.
2. Go to **Client portal**.
3. Enter the contact email and name.
4. Click **Invite**.

The contact is now recorded against the client as `invited`. This does not
grant internal app access.

## Share a document record

1. Open **Clients -> <client> -> Client portal**.
2. In **Documents**, enter a title.
3. Enter the storage path or URL.
4. Optionally map it to a project.
5. Choose visibility:
   - `client`: intended for client-side sharing.
   - `internal`: staff-only reference.
6. Click **Add document**.

Only share links or storage paths that are appropriate for the visibility
selected. Do not place private internal notes, cost rates, candidate ratings or
salary data in client-visible documents.

## Create an approval request

1. Open **Clients -> <client> -> Client portal**.
2. In **Approval requests**, enter a clear title.
3. Add details: what is being approved, by when, and any relevant context.
4. Optionally link a project or invoice.
5. Click **Request**.

Approval requests are tracked with statuses:

| Status | Meaning |
|---|---|
| `requested` | Waiting for the client decision |
| `approved` | Client approved |
| `rejected` | Client rejected or requested changes |
| `cancelled` | The request is no longer needed |

## Current client access boundary

The current app includes the client portal data model and internal
administration screens. A public standalone client login page is not part of
the current internal app surface.

Until a public client portal route is deployed, use the system's normal
client-facing communication flows for delivery:

- email documents or links from the account/invoice/client screens
- send invoice PDFs from the invoice screen
- log client calls, emails and notes on Account 360
- track approval decisions in the Client portal tab

## What clients should never access

Never expose these to client contacts:

- internal workspace roles
- cost rates, salary or payout data
- margin reports
- candidate/interview private notes
- internal security events or audit exports
- provider secrets or integration configuration
- admin, finance or owner screens

## Recommended operating pattern

For each active client:

1. Register the billing contact and delivery sponsor as portal users.
2. Add key project documents with correct visibility.
3. Create approval requests for monthly timesheet packs, scope changes or
   invoice support where client sign-off is required.
4. Keep the account timeline current with calls, meetings and email.
5. Use the client portal records as the audit trail for what was shared and
   what the client decided.
