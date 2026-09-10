# Regulars — API

NestJS service behind a New York product that forms small recurring friend groups: six
ID-verified people, matched by neighborhood and age band, meeting four times over four weeks,
then graduating into a group chat they own.

Live at `https://regulars-api-1.onrender.com/v1`. Postgres on Supabase, Prisma, deployed on
Render's free tier.

---

## Why this exists

Every product in this category breaks in the same three places, and the research that preceded
this code said so plainly.

1. **Women carry an unequal burden and nobody built the accountability layer.** The recurring
   complaint is not violent crime. It is a man putting his arm around someone at a dinner with no
   host, no report button, and no consequence. No major player mandates ID verification.
2. **One-off events cannot produce friendship.** Friendship comes from repeated low-stakes
   exposure. Every competitor is either 1:1 swiping or a single evening.
3. **The business model fights the user.** A subscription whose value ends when it works will
   always be tempted to stall.

Those three findings are why the schema looks the way it does. Each is enforced in code below,
not stated in a policy page.

---

## The three rules the data model enforces

**A removal is bound to a person, not an email address.** `Verification` stores the provider's
decision, a reference, and an identity hash. Never the document. When a webhook approves someone
whose hash matches an already-suspended account, the new account is suspended instead of let in.
Signing up again on Tuesday does not work.

```
src/verification/verification.service.ts  →  handleWebhook()
```

**Check-ins are immutable and private.** One per member per session. There is no update path, no
delete path, and no endpoint that lets one member read another's. A member cannot read their own
ratings back either. The reporter is never told what happened next, because "your report got them
removed" is itself a disclosure.

```
src/checkins/checkins.service.ts
```

**Consequences fail closed.** Two concern-level reports, or one severe report, suspends the
subject and pulls them from every future session *before* a human reviews it. A suspension that
waits for review is not a policy, it is a promise. The page-a-human webhook is fire-and-forget
and a delivery failure is logged as its own incident.

```
src/safety/safety.service.ts  →  raise()
```

---

## Decisions worth defending

**No passwords.** Sign-in is a six-digit code to an email address, hashed at rest, single use,
ten-minute expiry, five attempts, constant-time compare. There is no password to leak and no
reset flow to phish.

**Suspensions take effect on the next request, not on token expiry.** The JWT strategy re-reads
the user on every request rather than trusting claims. A thirty-day token would otherwise mean a
thirty-day window for someone who was just removed.

**A cohort will not confirm if the promise breaks.** Members are told the group size and gender
composition before they pay. `maybeConfirm()` compares the promise against reality and refuses to
confirm a cohort that does not meet it. The failure mode is a held or refunded cohort, never a
quiet substitution. "We said four women and delivered two" is the complaint that ends this
business.

**One charge, never a subscription.** Stripe is used in payment mode only. There is no stored
card, no renewal, and nothing to cancel.

**Notification policy is enforced in code, not documented.** At most eight pushes per member per
cohort: four day-of reminders, one confirmation, up to three group changes. There is deliberately
no re-engagement path. Every send writes a `Reminder` row *before* dispatch, so the unique
constraint is the idempotency key and a restart or overlapping cron tick cannot double-send.
Members who already cancelled are skipped, because reminding someone about an evening they
withdrew from is the small carelessness that loses trust.

**Row Level Security on every table.** Prisma creates tables in `public`, which Supabase exposes
through PostgREST, and the publishable key is public by design. RLS is enabled with no policies:
nothing reaches the REST API at all. The service connects as `postgres` and bypasses it.

---

## Shape

```
src/
  auth/           email code → JWT; re-reads the user on every request
  users/          profile, push token, in-app account deletion
  verification/   hosted ID flow, signed webhook, removal-evasion blocking
  cohorts/        the member's view; roster hidden until confirmed and paid
  sessions/       attendance: "running late" and "I cannot make it", one tap
  checkins/       immutable, private, write-only from the member's side
  safety/         flag thresholds, immediate suspension, human paging
  payments/       one-time checkout, signed webhook, promise-checked confirm
  notifications/  hourly scheduler, per-member reminder hour, idempotent sends
```

Every endpoint is guarded twice where it matters: `JwtAuthGuard` for identity, `VerifiedGuard` for
anything that puts a member in a room with other people.

---

## Running it

```bash
cp .env.example .env      # DATABASE_URL and JWT_SECRET are the only required ones
npm install
npm run prisma:push
npm run start:dev         # http://localhost:4000/v1
npm run seed you@email.com   # one running cohort with real Brooklyn venues
```

Without an email provider configured, login codes print to the console. `prisma/seed.sql` does
the same seeding through the Supabase SQL editor, for free-tier hosts with no shell access.

---

## Honest status

Built and working: auth, verification with evasion blocking, cohorts, sessions, attendance,
check-ins, flags with automatic suspension, one-time payment with promise-checked confirmation,
push scheduling, account deletion, RLS.

Stubbed, and marked with `TODO` at exactly two places: the outbound calls to Stripe and to the
identity provider return placeholder hosted URLs. Both webhooks, both signature checks and every
piece of logic behind them are real and tested against the live deployment.

Not built: email delivery, the operator console for matching, and tests. The absence of tests is
the honest gap in this repo, not an oversight I am hiding.

---

## What I would do next, in order

1. Email delivery, because the login code currently living in a server log is the single thing
   blocking real users.
2. A test suite starting with `SafetyService.raise()`, since that is the function where a bug
   causes actual harm rather than an inconvenience.
3. The operator console, which stays a human with a database query far longer than most people
   expect. Matching six people is not a ranking problem at this scale.
4. Move off the free Render tier, which sleeps after fifteen minutes and adds forty seconds to
   the first request.

Before any of that: run two cohorts by hand on a spreadsheet. Half this schema encodes guesses
about what a session feels like, and week-four attendance is the only number that says whether
any of them are right.
