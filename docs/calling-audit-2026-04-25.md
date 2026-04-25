# Calling Features — Full Audit, 2026-04-25

Scope: every file under `src/components/calling/`, `src/hooks/use-twilio-device.ts`, `src/app/api/twilio/`, `convex/calls.ts`, `convex/parkingLot.ts`, `convex/callStats.ts`, `convex/blockedNumbers.ts`, plus the dashboard layout + onboarding gating.

Total surface: **~9,800 lines** across 13 components, 1 hook, 28 API routes, 9 Convex modules.

This document is **the audit** — findings + remediation roadmap. It is not a code change. After review, work the **High** items first; those are real production bugs.

---

## Severity Legend

- 🔴 **High** — broken or actively harming users in production.
- 🟡 **Medium** — works today but fragile, security gap, or significant tech debt.
- 🟢 **Low** — cosmetic, nice-to-have cleanup.

---

## 🔴 HIGH — must fix

### H1. Drag-and-drop Transfer is non-functional

**Files:** `src/app/api/twilio/transfer-ring/route.ts` (line 57) + `src/app/api/twilio/transfer/route.ts` + `src/components/calling/calling-dashboard.tsx:299`.

**What's wrong:** `transfer-ring` returns TwiML with an empty `<Dial>`:

```ts
twiml.dial({                           // emits <Dial action="…" timeout="30"/>
  action: `${appUrl}/api/twilio/transfer-result?transferId=${transferId}`,
  timeout: 30,
});
```

No `.client()`, `.number()`, or `.conference()` is ever called on it. An empty `<Dial>` has no target, so Twilio's response is "do nothing", times out after 30 s, and `transfer-result` fires with `DialCallStatus=no-answer` which decline-cancels the pendingTransfer.

The original held call is never bridged to the target agent. It just sits on hold music until the source agent unholds.

**Net effect:** the entire drag-to-transfer-between-agents feature documented as ✅ in `CLAUDE.md` actually fails silently every time.

**Fix:** the correct pattern is to return TwiML that conferences both legs. Cleanest implementation:

1. In `transfer/route.ts`, replace the "redirect source to hold music" approach with a conference: `client.calls(twilioCallSid).update({ twiml: <Conference name=transfer-X waitUrl=…/> })` — same pattern as parking. Source caller hears hold music inside conference `transfer-X`.
2. In `transfer-ring/route.ts`, return TwiML that puts the answering target into the SAME conference: `<Dial><Conference startConferenceOnEnter=true endConferenceOnExit=true>transfer-X</Conference></Dial>`.
3. Cold transfer: source agent's browser leg disconnects after triggering. Warm transfer: source remains in the conference.
4. On decline / no-answer, `transfer-result` redirects the source caller back to the source agent (or back to the parking slot if `returnToParkSlot` was set).

Reference: Twilio's "Warm Transfer" guide uses the same conference pattern — https://www.twilio.com/docs/voice/twiml/dial/conference#warm-transfer.

**Verification:** initiate transfer from agent A to agent B, agent B answers → both legs hear each other. Hang up on either side → call ends. Agent B declines / doesn't answer → caller returns to hold music with agent A.

---

### H2. Voicemail recordings are never saved

**File:** `src/app/api/twilio/dial-status/route.ts` lines ~160-189 (the voicemail fallback branch).

**What's wrong:** the `<Record>` verb has `transcribeCallback` but no `recordingStatusCallback`:

```ts
twiml.record({
  timeout: 3,
  transcribe: true,
  maxLength: 120,
  transcribeCallback: `${appUrl}/api/twilio/transcription`,
  // ❌ NO recordingStatusCallback
});
```

`/api/twilio/recording` is the only place we write `callHistory.recordingUrl` and create `voicemails` rows (see `convex/calls.ts:storeRecording`). Without the callback, Twilio finishes the recording, the audio file lives only in Twilio's storage, and our DB has no `recordingUrl` and no `voicemails` row. Customers can't play voicemails back from the CRM.

**Fix:** add `recordingStatusCallback: \`${appUrl}/api/twilio/recording\`` and `recordingStatusCallbackEvent: ["completed"]` on the voicemail `<Record>`. Same callback the live-call recording uses (voice/route.ts:122).

**Verification:** miss a call so it goes to voicemail, leave a message → confirm a `voicemails` row appears with `recordingUrl` set, and the audio plays from `/api/twilio/recording/stream`.

---

### H3. Transfer route uses wrong caller ID (first-row bug)

**File:** `src/app/api/twilio/transfer/route.ts:60`.

```ts
const phoneNumbers = await convex.query(api.phoneNumbers.getByOrganization, …);
const callerNumber = phoneNumbers?.[0]?.phoneNumber || …;
```

Same arbitrary `[0]` pick we already fixed in voice + outbound. The transfer-ring leg's caller ID is whatever number Convex returned first — probably wrong.

**Fix:** swap to `api.phoneNumbers.getOutboundCallerId({ clerkOrgId: org.clerkOrgId, clerkUserId: <source agent's clerkUserId if known> })`. Already exists, ships with the same priority.

---

### H4. `/api/twilio/hold-music` Twilio webhook lacks signature validation

**File:** `src/app/api/twilio/hold-music/route.ts` (entire file).

This is a Twilio webhook (Twilio fetches it as the conference `waitUrl`). All other Twilio-facing routes use `validateTwilioWebhook(...)`. This one doesn't. Anyone discovering the URL can hit it, potentially probing tenant audio URLs (low-impact, but the route does query `phoneNumbers` for the org's custom hold music — could leak whether a number exists).

**Fix:** add `validateTwilioWebhook` like `parking-status/route.ts` does.

---

### H5. Stuck-card patch is shipped, but DB-fallback render path can still flicker

**File:** `src/components/calling/user-status-card.tsx:401`.

```tsx
{activeCalls.length > 0 && !twilioCallConnected && connectedCalls.length === 0 && …}
```

Even with the recent dual-SID `endByCallSid` fix (commit `81fb753`), there is a brief window between `removeCall(...)` (immediate, local) and the Convex subscription update (network round-trip) where this block re-renders the row from the DB. Most users won't notice (sub-second), but if Convex is slow OR the mutation errors silently, the card sticks until refresh.

**Fix:** introduce a per-callSid optimistic "I just hung this up" set in `useTwilioDevice` (or in `CallingProvider`), and have `UserStatusCard` filter `activeCalls` by `!recentlyHungUpSids.has(call.twilioCallSid) && !recentlyHungUpSids.has(call.childCallSid)`. Clear the set 5 s after each entry.

---

## 🟡 MEDIUM — fix soon

### M1. Dead Convex mutations in `convex/calls.ts`

12 unused exports — discoverable in the dashboard, callable by anyone with `npx convex run`, and confusing to read past:

| Function | Replaced by | Status |
|---|---|---|
| `getRinging` | n/a (never used) | delete |
| `getParked` | `getActive` (state filter) | delete |
| `getByUser` | n/a | delete |
| `createIncoming` (internal) | `createOrGetIncomingFromWebhook` | delete |
| `createOrGetIncoming` (authed) | webhook variant | delete |
| `updateStatus` (internal) | `updateStatusFromWebhook` | delete |
| `answer` | `claimCall` | delete |
| `park` | `parkByCallSid` | delete |
| `unpark` | targetedRinging unpark flow | delete |
| `transfer` | pendingTransfers (after H1 fix) | delete |
| `setHold` | hold-call API + Twilio conference | delete |
| `clearAllActiveCalls` | `clearStuckActiveCalls` | delete |

Plus `convex/parkingLot.ts`: `getSlot` and `initialize`.

**Fix:** delete after one careful grep across `src/`, `convex/`, and the `_generated/api.d.ts` to confirm zero call sites.

---

### M2. Dead API routes

| Route | Refs | Action |
|---|---|---|
| `/api/twilio/resume-dial` | 0 | delete |
| `/api/twilio/transfer-answer` | 0 | delete |
| `/api/twilio/transfer-decline` | 0 | delete |
| `/api/twilio/hold-music-stream` | 0 | delete |

`usage-sync` and `test-master` are user-facing admin routes — keep, but note: `usage-sync` is meant to be a cron and currently isn't wired to one (no `convex/crons.ts`).

---

### M3. Legacy single-call code paths in hook + provider + dashboard

**Files:** `src/hooks/use-twilio-device.ts`, `src/components/calling/calling-provider.tsx`, `src/components/calling/calling-dashboard.tsx`, `src/components/calling/user-status-card.tsx`.

`useTwilioDevice` exposes `answerCall`, `rejectCall`, `hangUp`, `toggleMute` (no `BySid`) for "backward compatibility". `CallingProvider` re-exports them. `CallingDashboard` declares them at lines 83-86 — but **never uses them**. Only the `*BySid` variants are used downstream.

`UserStatusCard` (lines 374-398) and `CallingDashboard` (~line 504) also have entire legacy single-call render branches gated by `!isMultiCallMode && twilioCallConnected`. Since multi-call mode is always enabled now (provider always passes the array), these branches are unreachable.

**Fix:** delete the legacy interfaces from the hook (~80 lines), provider (~20 lines), dashboard (~30 lines), user-status-card (~30 lines). ~160 lines of dead React.

**Reduces** `use-twilio-device.ts` from 1,131 to ~950 lines.

---

### M4. Disposition dialog can fire twice

**File:** `src/components/calling/disposition-dialog.tsx:56`.

Listens for `crm:call-ended`. The event is dispatched from BOTH the inbound disconnect handler (use-twilio-device.ts:478) AND the outbound disconnect handler (use-twilio-device.ts:669). If the Twilio SDK's disconnect fires twice (it can — once on `disconnect`, once on `cancel`), the dialog opens twice in quick succession. Currently the dialog has no debounce.

**Fix:** dedupe by `callHistoryId`. Track the last-seen id and ignore re-fires within ~3 s.

---

### M5. Hold-music depends on `twimlets.com` (third-party)

**File:** docs and `convex/calls.ts` parking comments reference `http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical`.

`twimlets.com` is a long-running Twilio community service but isn't a documented Twilio product with an SLA. The `http://` (not https) is also a red flag for some browsers / corporate proxies.

**Fix:** Two options.
1. Use Twilio's bundled hold music URLs (https): `https://demo.twilio.com/docs/classic.mp3`.
2. Self-host hold music in Convex storage and use `/api/twilio/hold-music` (already exists for the per-org custom upload — extend to a default).

---

### M6. `outbound-status` and `dial-status` decline-only branch don't update presence

**Files:** `src/app/api/twilio/outbound-status/route.ts`, `src/app/api/twilio/dial-status/route.ts`.

When an outbound call is canceled / fails before answer, `updateStatusFromWebhook` is called. That mutation (in `convex/calls.ts:updateStatusHandler`) deletes the activeCalls row but does NOT flip presence back to `available` for the calling user.

For inbound the same is true if Twilio webhook fires before our React hangup path.

**Fix:** mirror the presence-flip logic from `endByCallSid` (~lines 970-988) into `updateStatusHandler`. Or factor the flip into a shared helper.

---

### M7. `/api/twilio/voice` outbound branch uses `phoneNumbers[0]` for the activeCalls insert

**File:** `src/app/api/twilio/voice/route.ts` lines ~92-104.

The DB row's `from` is set from `callerId` (now correctly resolved by `getOutboundCallerId` ✅). Good.

But the `createOrGetOutgoingFromWebhook` mutation inside `convex/calls.ts:284` then re-derives `organizationId` from the phone-number lookup using `from`. If the resolved caller-ID number is one we OWN (which it always should be), great. If we ever resolve to an env fallback that isn't a tenant number, the row insert returns null silently (logged at line 102). Possible hidden failure mode.

**Fix:** pass `organizationId` explicitly into the mutation rather than re-deriving.

---

### M8. `dashboard/layout.tsx` is 1,040 lines

User memory says it was "extracted from 842" recently — it grew by ~200. Hard to maintain and a single-component re-render hotspot.

**Fix:** extract:
- The huge "redirect tenant admins to onboarding" effect into a `useOnboardingRedirect` hook.
- The CallingProvider gating into `<DashboardCallingShell>`.
- Header / nav already extracted to `sidebar/`. Confirm there isn't more leakage.

---

## 🟢 LOW — cleanups

### L1. 61 `console.log` calls in `use-twilio-device.ts`

Helpful when debugging Twilio SDK weirdness, but they ship to production and pollute every browser console. Gate behind `process.env.NEXT_PUBLIC_TWILIO_DEBUG` or an in-app toggle.

### L2. Dead destructures in `CallingDashboard`

Lines 83-86 declare `answerCall`, `rejectCall`, `hangUp`, `toggleMute` and never use them. Delete with M3.

### L3. `parking-lot.tsx` exports unused `ParkedCallCard`

Internal sub-component never re-imported. Fine to inline.

### L4. Hook ESLint warnings

Two pre-existing react-hooks/exhaustive-deps warnings in `use-twilio-device.ts:700,795`. Fix with proper deps + `useMemo`.

### L5. `dial-status` outbound vs inbound URLs differ

Outbound uses `/api/twilio/dial-status` (no params). Inbound uses `/api/twilio/dial-status?phoneId=…&orgId=…`. The route auto-distinguishes by reading the query string — works, but worth a comment so a future developer doesn't break it.

### L6. `audio-unlock-banner` always mounts

Banner component is wired in the layout. Fine, but it polls/subscribes even on pages that won't take a call (e.g. `/admin/billing`). Not worth fixing unless we see render cost.

---

## ✅ What's working well (don't touch)

- **Dual-SID `endByCallSid`** (commit `81fb753`) — robust, idempotent, handles inbound + outbound + fallback paths.
- **`getOutboundCallerId`** (commit `f487937`) — clean priority, single round-trip, well-commented.
- **`<Reject reason="busy">`** for blocked callers — matches Twilio's recommended pattern.
- **Conference-based parking** with `endConferenceOnExit="false"` — verified correct, won't drop the parked caller when the agent disconnects.
- **Voice-webhook critical path** is parallelised with `Promise.all` and fire-and-forget mutations — keeps inbound rings under the 200 ms target.
- **Token route** refreshes 60 s before expiry — well-tuned.
- **Per-subaccount Twilio auth** with `getOrgTwilioClient` + decrypt fallback — solid multi-tenant pattern.
- **Webhook signature validation** is consistent across every Twilio-facing route except `hold-music` (see H4).

---

## Twilio-Docs Cross-Check

Re-confirmed against current Twilio docs (Voice SDK 2.x, TwiML, Conference, Recording).

| Area | Our code | Twilio docs | Verdict |
|---|---|---|---|
| Browser-to-PSTN dial | `Device.connect({ params })` + voice webhook returns `<Dial><Number>` | Standard pattern | ✅ |
| Inbound dial to client | `<Dial><Client>` with statusCallback | Standard | ✅ |
| Conference parking | `<Conference startConferenceOnEnter=true endConferenceOnExit=false>` | Documented warm-transfer-style pattern | ✅ |
| Block caller | `<Reject reason="busy">` | Recommended (cheaper than `<Hangup/>`) | ✅ |
| Recording | `record="record-from-answer-dual"` + `recordingStatusCallback` | Standard | ✅ for live calls, ❌ for voicemail (see H2) |
| Transfer | empty `<Dial>` | Should be `<Dial><Conference>` warm transfer | ❌ (see H1) |
| Token refresh | `tokenWillExpire` + manual 60 s pre-refresh | Recommended | ✅ |
| `Device.allowIncomingWhileBusy=true` | Set | Required for multi-call | ✅ |
| Closing call legs on hangup | `client.calls(parentSid).update({ status: "completed" })` | Documented | ✅ |
| Webhook signature | `twilio.validateRequest` | Required for prod | ✅ except `hold-music` |

---

## Remediation Roadmap

A pragmatic order to land this. Each step is one PR-sized change.

### Sprint 1 — bugs (high)

1. **H1 — fix Transfer.** Rewrite `transfer/route.ts` + `transfer-ring/route.ts` to use a conference. Add an integration smoke test in production: A → B drag-transfer → both legs talk.
2. **H2 — fix voicemail recording.** Add `recordingStatusCallback` to the voicemail `<Record>` in `dial-status/route.ts`. Verify one voicemail from outside.
3. **H3 — switch transfer caller-ID lookup** to `getOutboundCallerId` (one-line swap).
4. **H4 — add `validateTwilioWebhook` to `hold-music`.** Two minutes.
5. **H5 — optimistic hangup filter** in `useTwilioDevice` / `UserStatusCard`. Eliminates flicker.

### Sprint 2 — dead code (medium)

6. **M1 — delete 12 unused Convex mutations** from `calls.ts` + 2 from `parkingLot.ts`. Run `npx tsc --noEmit && npx convex deploy` to verify.
7. **M2 — delete 4 unused API routes.**
8. **M3 — delete legacy single-call code paths** from hook + provider + dashboard + user-status-card. ~160 LOC removed. Single PR; behavior shouldn't change.

### Sprint 3 — robustness (medium)

9. **M4 — debounce `crm:call-ended`** in disposition-dialog.
10. **M5 — replace twimlets.com hold music** with self-hosted or `demo.twilio.com/docs/classic.mp3`.
11. **M6 — presence flip on Twilio-driven hangup** in `updateStatusHandler`.
12. **M7 — pass orgId explicitly** to `createOrGetOutgoingFromWebhook`.
13. **M8 — split `dashboard/layout.tsx`.**

### Sprint 4 — polish (low)

14. **L1 — gate `console.log` behind a debug flag.**
15. **L2 — clean up `CallingDashboard` destructures** (covered by M3).
16. **L4 — fix the two ESLint warnings** in the hook.
17. Consider adding a small cron (`convex/crons.ts`) for `clearStuckActiveCalls` — auto-flush calls older than 1 hour every 30 minutes.

### Sprint 5 — testing (medium)

The codebase has no calling-flow tests. After the bug fixes, add Playwright e2e tests for:
- Inbound: external phone calls org → agent answers → both talk → either hangs up → call card clears.
- Outbound: agent dials → callee answers → either hangs up.
- Park / unpark: agent parks → caller hears music → second agent unparks → call connects.
- Transfer (post-H1): A initiates transfer → B answers → conferenced → A drops or stays.
- Block: block a number → call from that number → caller gets busy.
- Voicemail (post-H2): no agents available → caller leaves voicemail → playback works.

Convex MCP can run `runOneoffQuery` between steps to assert DB state.

---

## Decision Points

Before I touch any code, I need your call on three things:

1. **Transfer behavior (H1):** cold-only (source drops immediately), warm-only (source stays in conference), or both with a UI toggle?
2. **Hold music (M5):** Twilio's free `demo.twilio.com/docs/classic.mp3`, or upload-your-own (extend the per-org custom slot to provide a tenant-default)?
3. **Sprint scope:** want me to ship Sprint 1 (5 high-severity bugs) as one big PR, or one bug per PR for safer rollback?

Tell me 1/2/3 and I'll execute.
