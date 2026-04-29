# Deployment Environments — what's REALLY hosted where

**Status:** Drafted 2026-04-29 after spending 30 minutes debugging "why is the prod Convex empty when the production URL clearly has data."

Short version: **the URL `crm-voip-production.up.railway.app` is misleading. It is currently a development-mode deployment.** This document explains the real layout and how to fix it.

---

## What we have today

| Layer | "Production" URL | Actual deployment |
|---|---|---|
| Web (Next.js) | `crm-voip-production.up.railway.app` | Built with **dev** Clerk + **dev** Convex env vars |
| Auth (Clerk) | Pretends to be prod | `pk_test_…` key → `devoted-halibut-2.clerk.accounts.dev` (dev instance) |
| Database (Convex) | "prod" `small-dog-175` exists but is **empty** | Real data lives on `chatty-dinosaur-939` (the "dev" deployment) |
| Twilio webhooks | Point to `crm-voip-production.up.railway.app/api/twilio/*` (correct) | Webhooks reach the Railway box → which talks to the *dev* Convex |

So `https://crm-voip-production.up.railway.app` is functionally a **public dev environment** wearing a "production" name. It works — Twilio webhooks land, calls flow, data persists. But:

- Calling it "production" implies real-customer-data isolation we don't have.
- A real production cutover requires repointing Railway + Twilio + Clerk *together* — the docs/ROLLBACK_VERCEL.md from 2026-04-16 only covered the Twilio side.
- The MCP `--prod` Convex selector points at the empty `small-dog-175` deployment, so anyone trying to debug prod data via MCP gets `[]` and goes hunting for a non-existent bug.

## Why this matters

Today's debug session: user reported "wrong caller ID in call log." I queried Convex prod via MCP — got nothing. Spent ~15 minutes assuming a code bug, then noticed the Clerk `pk_test_…` key in the Railway-served HTML, realised the data was actually on the "dev" Convex, queried THAT, and found the truth instantly (the recorded From was correct; the user was testing from a different phone than they thought).

This will keep happening every time someone tries to debug prod data through any tool that respects Convex's `--prod` flag.

---

## How to fix it — three options

Pick one. None are urgent enough to bump Sprint 1, but the longer this sits the more painful it is.

### Option A — promote the current dev → real prod (minimal disruption) ✅ recommended

Today's "production" URL stays. We just rename what's behind it so naming matches reality.

1. **Convex** — promote `chatty-dinosaur-939` to be the prod deployment.
   - Convex dashboard → project → set `chatty-dinosaur-939` as the prod team. Or the simpler path: leave it as-is and don't run `npx convex deploy --prod` from this project. Use plain `npx convex deploy` (which targets the dev environment that Railway is built against). Update CLAUDE.md to reflect.
2. **Clerk** — switch Railway's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` env vars to a **production** Clerk instance (`pk_live_…` / `sk_live_…`). Repoint the Clerk webhook URL to the Railway domain. Migrate users (Clerk has a one-click "Migrate from dev to prod" path).
3. **Twilio** — already correct.
4. **Convex `small-dog-175`** — delete it. It's confusing dead weight.
5. **Update `CLAUDE.md`** — single "Production deployment" section listing the real URLs/keys.
6. **Tag the migration** — git tag `v1-prod-cutover`.

Net: same URL, but now the "production" name is honest. Real prod-mode Clerk session protection, real audit trail, no MCP confusion.

### Option B — rename the URL to match reality

Leaves env vars untouched. Just renames the Railway service so nothing claims to be production yet.

1. Railway dashboard → service → rename to `crm-voip-staging` (or `dev`).
2. Generate the new public domain.
3. **Reconfigure Twilio webhooks** to the new domain via the rollback recipe in docs/ROLLBACK_VERCEL.md (in reverse).
4. Anyone testing knows it's not prod.
5. Real prod gets stood up later when needed.

Cheaper than A but the URL change disrupts active testing.

### Option C — stand up TRUE prod alongside

Best long-term, biggest effort.

1. Create a second Railway service (`crm-voip-prod`).
2. Build it with `pk_live_…` Clerk + `small-dog-175` Convex (after seeding it from a `chatty-dinosaur-939` backup).
3. Stand up real prod Clerk org + tenants.
4. Repoint Twilio prod webhooks.
5. The current `crm-voip-production.up.railway.app` stays as staging.

Right answer eventually, but only worth the lift when there's a real first paying customer who needs real data isolation.

---

## What I just did about it (the small thing)

Added `convex/crons.ts` so the stuck-row cleanup runs automatically every 30 minutes. That's independent of which deployment is "real" — it'll run wherever the code is deployed. So even with the current confusion, the activeCalls table won't accumulate zombies again.

```
crons.interval(
  "sweep stale ringing activeCalls",
  { minutes: 30 },
  internal.inspectCallLog.cleanStaleRinging,
  { olderThanMinutes: 60 },
);
```

`cleanStaleRinging` is now an `internalMutation` — callable from crons + the convex CLI, NOT from the public API.

---

## Reference

- Twilio webhook config: `docs/ROLLBACK_VERCEL.md`
- Railway-vs-Vercel history: `docs/RAILWAY_DEPLOYMENT.md`
- Today's call-log debug session: this file's "Why this matters" section.
