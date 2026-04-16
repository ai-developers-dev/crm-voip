# Railway Deployment — Playwright Quote Agent

## Why Railway exists in this project

Vercel serverless cannot host the Playwright-based carrier portal agent. Each
API invocation runs in a fresh container, so the in-memory `TEST_SESSIONS` /
`QUOTE_SESSIONS` Maps in [src/lib/portals/natgen-portal.ts](../src/lib/portals/natgen-portal.ts)
are empty on invocation #2 — the user hits **"Session expired"** immediately
after submitting a 2FA code.

Railway runs Next.js as a single long-lived Node process (the same model as
`npm run dev`), so the Maps survive between requests and Playwright browsers
stay alive while the UI waits for a 2FA code.

---

## Phase 1 — Single Railway service (this is what's shipped now)

Deploy the **whole** Next.js app to Railway. Same Convex, same Clerk, same
Twilio — just a different compute host.

### What's in the repo

- `Dockerfile` — builds from `mcr.microsoft.com/playwright:v1.58.2-jammy`
  (Chromium preinstalled, no `npx playwright install` step needed).
- `.dockerignore` — keeps `.next`, `node_modules`, docs, and `insurance-quoting-agent`
  out of the build context.
- `src/lib/portals/natgen-portal.ts` → `launchBrowser` detects
  `RAILWAY_ENVIRONMENT` and launches Playwright's bundled Chromium (no
  `channel: "chrome"` because Google Chrome isn't in the image).

### One-time Railway setup

1. **Create project** → New Project → Deploy from GitHub repo → pick
   `ai-developers-dev/crm-voip`.
2. **Settings → Build** → leave defaults. Railway auto-detects the
   Dockerfile.
3. **Variables** → copy these from Vercel (Project → Settings → Env vars):
   ```
   NEXT_PUBLIC_CONVEX_URL
   CONVEX_DEPLOYMENT
   CONVEX_DEPLOY_KEY
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   CLERK_SECRET_KEY
   CLERK_WEBHOOK_SECRET
   TWILIO_ACCOUNT_SID
   TWILIO_AUTH_TOKEN
   TWILIO_API_KEY
   TWILIO_API_SECRET
   TWILIO_TWIML_APP_SID
   TWILIO_PHONE_NUMBER
   CREDENTIAL_ENCRYPTION_KEY   ← must match Vercel's value
   ```
   `CREDENTIAL_ENCRYPTION_KEY` **must be identical** to the Vercel value
   or previously-saved carrier credentials won't decrypt.
4. **Variables → build args** → set these as *both* runtime vars AND
   build-time args (Railway > Settings > Build > Build Args):
   ```
   NEXT_PUBLIC_CONVEX_URL
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   ```
   Next.js bakes `NEXT_PUBLIC_*` into the client bundle at build time.
5. **Networking** → generate a domain. Railway gives you
   `<project>.up.railway.app`.
6. **Deploy** → trigger build. First build takes ~5 min.

### Verify it works

1. Open the Railway URL → log in (Clerk).
2. Settings → Carriers → re-save NatGen credentials (encryption key
   is the same as Vercel but Railway has a fresh filesystem).
3. Contact panel → Quote → submit.
4. First run: expect 2FA prompt → enter code → **should complete**
   (this is the flow that was failing on Vercel).
5. Second run within 24h: cookies are loaded from Convex, no 2FA.

### Known-small scope

- Single process → handles ~2–3 concurrent Playwright sessions before
  RAM pressure (Railway Hobby plan = 512 MB). Good enough for initial
  testing and a small handful of tenants.
- Twilio webhooks, Clerk webhooks → keep pointing at Vercel for now.
  Only the quote-agent flows need Railway.
- DNS → don't cut over your primary domain yet. Use the Railway
  subdomain for testing quoting; keep Vercel for the rest.

---

## Phase 2 — SaaS-ready worker pool (future refactor)

Trigger: when you have enough tenants that one Railway process starts
queueing or OOM'ing. Rough sizing: **~10+ active tenants** doing daily
2FA + multi-lead runs.

### Target architecture

```
         Vercel (UI + stateless API)
              │
              ▼
        ┌──────────┐
        │  Convex  │  ← agentRuns table acts as job queue
        │          │  ← per-(tenant,carrier) storageState
        │          │  ← per-run 2FA state + prompt text
        └────┬─────┘
             │ reactive subscriptions
             ▼
   ┌───────────────────────────┐
   │  Railway worker pool      │
   │  (N instances, N ≥ 1)     │
   │                           │
   │  Each worker:             │
   │   1. Claim next queued    │
   │      agentRun atomically  │
   │   2. Launch Playwright    │
   │   3. On 2FA: write        │
   │      awaiting_2fa + prompt│
   │      to Convex            │
   │   4. Subscribe for code   │
   │      mutation             │
   │   5. Resume, save cookies │
   │      save result          │
   └───────────────────────────┘
```

### What moves where

- **Delete from Next.js (Vercel):**
  - `/src/app/api/quotes/run-agent/route.ts`
  - `/src/app/api/portal-test/*/route.ts`
- **New Railway service** (`apps/quote-worker/`):
  - `src/index.ts` — entrypoint that subscribes to `agentRuns`
  - Imports existing `src/lib/portals/*` (share code via pnpm/npm
    workspaces or a published internal package)
  - Uses `ConvexHttpClient` for mutations, `ConvexClient` with websocket
    for reactive queries
- **Convex mutations to add:**
  - `agentRuns.claimNext(workerId)` — atomic claim: find next queued
    run, mark `running`, return it (or null)
  - `agentRuns.setAwaiting2fa(runId, sessionId, prompt)` — worker
    calls after hitting 2FA
  - `agentRuns.submit2faCode(runId, code)` — UI calls; triggers
    reactive pickup by worker
  - `agentRuns.claim2faCode(runId)` — worker calls to consume code
    (clear it so it can't be replayed)
- **Convex schema additions on `agentRuns`:**
  - `status`: extend with `"awaiting_2fa"`
  - `twoFactorPrompt?: string`
  - `twoFactorCode?: string`
  - `workerId?: string`
  - `claimedAt?: number`

### UI changes

- `quote-panel.tsx` — replace the POST `/api/quotes/run-agent` +
  POST `resume_2fa` pattern with:
  1. Convex mutation `agentRuns.enqueue(...)`
  2. Subscribe to the resulting `agentRun` doc
  3. When status flips to `awaiting_2fa`, show the code input
  4. Submit code via `agentRuns.submit2faCode` mutation
  5. Done when status is `completed` or `failed`

### Concurrency math (planning guide)

Assumptions for 100-tenant SaaS, 3 active carriers each:
- Daily 2FA events: ~300 (once per tenant/carrier/day)
- Quote runs: ~50–200/day depending on lead volume
- Peak concurrent browsers: 3–5
- One Railway worker handles 2 concurrent browsers on the 512 MB
  Hobby plan, 4 on the 1 GB Pro plan
- Start with **3 workers @ $5/mo = $15/mo**; scale from there

### Open questions for Phase 2

- Which worker framework? Bare `node src/index.ts` with a process
  manager is fine; no Express needed since workers poll Convex.
- Graceful shutdown: workers should finish the current job before
  Railway kills them on deploy. Wire `SIGTERM` → drain.
- Retry policy: if a worker dies mid-run, should the job auto-requeue?
  Probably yes, with a max-attempts counter to avoid infinite loops.
- Observability: push worker logs to Sentry + Convex logs table.

---

## Troubleshooting (Phase 1)

### Build fails with "playwright install" errors
The Dockerfile uses the Playwright image which already has browsers.
Make sure no one added `RUN npx playwright install` to the Dockerfile.

### Credentials saved on Vercel don't decrypt on Railway
`CREDENTIAL_ENCRYPTION_KEY` differs between deployments. Either copy
the exact value from Vercel, or have the user re-enter credentials
on Railway.

### "Session expired" still appearing
- Check `process.env.RAILWAY_ENVIRONMENT` is set (Railway sets this
  automatically — verify in a `console.log`)
- Confirm only ONE instance is running (Settings → Deploy → instances = 1).
  Multiple instances reintroduce the cross-process state bug.
- Check memory — if Chromium is getting OOM-killed, the session Map
  loses entries. Upgrade plan or reduce concurrent runs.

### Twilio Voice doesn't work from Railway URL
Twilio webhooks are configured to hit the Vercel URL. Leave them
there. Railway is only for testing quote flows; keep Vercel as the
webhook target until full migration.

---

## Migration checklist (when ready to fully cut over from Vercel)

- [ ] Update Twilio Voice webhooks → Railway URL
- [ ] Update Clerk webhook → Railway URL (`/api/webhooks/clerk`)
- [ ] Update Convex webhook URLs if any point to Vercel
- [ ] Point primary DNS at Railway
- [ ] Remove `@sparticuz/chromium` dependency (Vercel-only)
- [ ] Remove `serverExternalPackages` line in `next.config.ts`
- [ ] Remove Vercel project (or keep as preview-only)
