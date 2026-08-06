# Finance guide — the money loop

You run the loop that pays everyone: approved hours → invoice → payment →
payout → margin. Every step is a workflow action with server-side guards —
the system will physically refuse the shortcuts (editing an issued invoice,
overpaying, paying out unapproved hours), so the path described here is the
only path.

## Setup that everything depends on

- **Clients**: legal name, billing address, **invoice code** (becomes part of
  invoice numbers — choose carefully, e.g. `ACME`), payment terms, tax rate,
  currency, billing contact, timezone, invoice grouping (how lines are rolled
  up: per project / person / role / detailed).
- **Rate cards** (what the client pays): per project or client, **effective-
  dated** — a raise from June 18 bills old work at the old rate and new work
  at the new rate automatically. Never overwrite a rate; add a new card with
  the new effective date.
- **Cost rates** (what a person costs): hourly or monthly, effective-dated.
  A missing cost rate makes margin wrong and is flagged in the payout
  reconciliation view.

## Invoicing (monthly rhythm)

1. **Reports → Unbilled work** — what's approved and not yet invoiced. This
   is your revenue-leakage check; it should trend to zero after billing runs.
2. **Invoices → Generate draft** (client + period). The system gathers
   approved un-invoiced T&M entries priced from the rate card effective on
   each work date, plus retainer fees and ready-to-bill milestones, grouped
   per the client's preference. Rounding: half-up to 2dp per line; total =
   sum of rounded lines.
3. **Review the draft** — edit/add/remove lines freely, add manual lines.
   Wrong period? Delete the draft; the entries are released for regeneration.
4. **Issue.** Atomically: claims the number (`INV-CODE-YYYY-NNNN`, per client
   per year), stamps every included entry, sets the due date from the
   client's terms, freezes the invoice. From here it is immutable.
5. **Send** from the invoice screen — the email composer attaches the
   official PDF; it's logged on the client timeline.

**Corrections after issue** (the only ways):

| Problem | Action |
|---|---|
| Overcharged / goodwill | **Credit note** — issued immediately with a `CN-` number, negative amount, referencing the original |
| Invoice fundamentally wrong | **Void** (reason required) + regenerate. Voided invoices keep their number and stay on record |
| Client paid too little/much | Payments are exact: record what arrived; the system derives partially_paid/paid and refuses overpayments — excess money = credit note territory |

## Payments and collections

- **Record payment** on the invoice (amount, date, method). Partial payments
  accumulate; the client's account owner is notified on full settlement.
- **Bank CSV import** (Invoices → Import bank CSV): paste statement rows;
  they're matched by invoice number in the reference (high confidence) or
  exact outstanding amount (medium). Nothing records until you apply a row.
- **Dunning is automatic**: courtesy at due−3; overdue reminders at +7, +14,
  +30 to the billing contact. It stops when payment is recorded. Hold it
  with **Pause dunning** on an invoice, or open an **escalation** on the
  client (pauses all overdue-tone mail; courtesy still goes).
- **Aging** report: who owes what, bucketed, with totals.

## Payouts (per period)

1. **Generate statements** for a period — one draft per person from their
   approved hours × cost rate. Entries already on a statement are never
   picked up twice.
2. **Reconciliation view**: approved vs billed vs paid-out hours per person/
   month. `missing_cost_rate` rows = fix before confirming.
3. **Confirm** (notifies the person) → pay outside the system → **Mark paid**.
   Statements are immutable after confirm; the FSM enforces
   draft → confirmed → paid.

## Reporting and accounting

- **Margin** = invoiced revenue − (approved hours × cost rate), per project
  per month. Zero-revenue months with cost are normal timing (work invoiced
  next month) — red margins that persist are not.
- **Accounting export** (Reports → Accounting): double-entry journal (AR /
  revenue / tax / cash / credit notes) for any period, CSV for your
  accountant. **It must always balance** — an imbalance is a bug to report,
  never something to adjust manually.
- Monthly **client digest** (hours appendix per client) supports invoices on
  request.
