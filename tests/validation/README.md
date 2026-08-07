# Workflow validation suite

Executable business-logic checks that run against the environment in
`.env.local` using the seeded demo users (password `password123`). They create
data under a dedicated test client (VTST) and clean up after themselves.

```bash
# from apps/outsourcing-platform (needs node_modules)
node tests/validation/v0-foundation.mjs     # RLS matrix, write guards, audit
node tests/validation/v1-time.mjs           # timesheet lifecycle + immutability
node tests/validation/v2-billing.mjs        # rates, invoicing, numbering, freeze
node tests/validation/v2b-payments.mjs      # payment guards (overpay/negative)
node tests/validation/v3-collections.mjs    # overdue, dunning ladder, escalations
node tests/validation/v4-payouts.mjs        # payouts, reconciliation, margin, export
node tests/validation/v5-staffing.mjs       # bench, requests, matching, time off
node tests/validation/v6-sales.mjs          # lead FSM, quotes, win handoff, renewals
node tests/validation/v7-prospecting.mjs    # cadences, DNC, convert, health, 360
node tests/validation/v8-talent.mjs         # candidate FSM, privacy, hire wizard
node tests/validation/v9-center-comms.mjs   # command center, calendar, identities
node tests/validation/v10-mfa.mjs           # MFA end-to-end (needs dev server :5199 + playwright)
node tests/validation/v11-notifications.mjs # notification/email digest idempotency
node tests/validation/v12-security-hardening.mjs # owner-only + backend MFA enforcement
node tests/validation/v13-compliance-readiness.mjs # static OWASP/GDPR readiness guardrails
node tests/validation/v14-privacy-governance.mjs # hosted privacy request/export workflow
node tests/validation/v15-security-events.mjs # hosted security event logging workflow
```

Each prints PASS/FAIL per check and exits non-zero on failure.
Caveats: v2 is not fully idempotent (numbering advances per run); v10 drives
the UI via Playwright and enrolls a TOTP factor for test.contractor@ibrave.co.
