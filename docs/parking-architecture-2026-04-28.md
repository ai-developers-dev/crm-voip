# Call Parking — Architecture Review & Detailed Plan

**Status:** Drafted 2026-04-28 after the parking-duplicates-and-stuck-card incident.
**Audience:** Doug, future Claude sessions.

This document does three things:

1. Summarises Twilio's recommended call-parking architecture (from the Twilio Voice docs + the official "Build a Call Parking Lot" tutorial).
2. Maps that recommendation to **our current implementation**, line-by-line, so you can see where we agree and where we diverge.
3. Lays out a **specific, prioritised remediation plan** to make our parking flow rock-solid.

---

## Part 1 — Twilio's Recommended Pattern

Twilio doesn't have a server-side "park this call" REST endpoint. The pattern they document for call-parking — used by their own "Call Parking Lot" tutorial and reinforced across the Voice docs — is **conference-based parking**. Here is the full lifecycle:

### 1.1 Parking a call

When an agent decides to park a call:

```
1. Pick a unique conference name (you choose — UUID, slot number, whatever).
2. POST to https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/Calls/{PSTN_LEG_SID}.json
   with `Twiml=<Response><Dial><Conference …>NAME</Conference></Dial></Response>`.
   The PSTN leg is now redirected from whatever bridge it was in (e.g. <Dial><Client>)
   into a Twilio conference. The Twilio docs are explicit that this `update` call
   replaces the call's currently-executing TwiML.
3. The Conference verb's `waitUrl` plays hold music while the conference has
   only one participant.
4. Set `endConferenceOnExit="false"` so the conference doesn't end when the
   agent leg leaves (their <Dial> bridge is broken by the redirect, so their
   leg ends — but the conference must stay alive for the parked caller).
5. Set `startConferenceOnEnter="false"` for the parked caller — the conference
   doesn't truly "start" until an unparking agent joins, which keeps the wait-
   music playing for the caller alone.
```

### 1.2 Parked-state side effects (per Twilio's tutorial)

When step 2 above fires:

- **The agent's leg ends.** The agent was on the *child* of the original `<Dial>`. Replacing the parent's TwiML breaks the dial bridge → child leg sees `Hangup`. The agent's browser SDK fires `disconnect`.
- **A `participant-join` event fires** for the PSTN leg as it joins the conference. (Optional `statusCallback` on `<Conference>` lets you hear it.)
- **The conference name lives only in your application's records** — Twilio doesn't store any "this call is parked" flag. **You** are the source of truth for "is X parked?"

### 1.3 Unparking a call

To pull a parked call to a specific agent:

```
1. POST to https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/Calls/{PSTN_LEG_SID}.json
   with `Twiml=<Response><Dial><Client>agentIdentity</Client></Dial></Response>`.
2. The PSTN leg leaves the conference and is redirected to a new <Dial><Client>
   bridge. Conference is now empty → ends (regardless of endConferenceOnExit
   semantics; the conference ends when the last participant leaves).
3. The agent's browser SDK fires an `incoming` event for the new client leg.
   Agent answers → bridge connects → talking again.
```

### 1.4 Parked caller hangs up before unpark

```
1. PSTN leg disconnects.
2. Twilio fires `conference-end` (configured via Conference's `statusCallback`).
3. Your webhook runs cleanup: clear the parking slot, archive to call history.
```

### 1.5 What Twilio is silent about (but the docs imply)

- **You must have a stable PSTN-leg SID** to park/unpark. If you've been fighting dual-leg SID issues elsewhere, parking is the place where you absolutely cannot get this wrong — every park/unpark hits `client.calls(SID).update()` and the SID *must* be the PSTN parent.
- **Don't terminate the parked PSTN leg accidentally.** The most common failure mode is some other code path (e.g. a hangup-cleanup endpoint) seeing the agent's `disconnect` event and POSTing `Status=completed` to the parent leg's SID — which kills the parked caller. Per the docs, "Status=completed has the same effect as the caller hanging up." Your cleanup logic must check whether the call is currently parked **before** terminating.
- **The conference is the source of truth for "is the caller alive?"**, but **your application** is the source of truth for "is X parked?" because Twilio doesn't expose conference state in their normal Call resource.

---

## Part 2 — Our Implementation, Mapped to the Twilio Pattern

### 2.1 What we get right ✅

| Twilio recommendation | Our code | Status |
|---|---|---|
| Use Conference, not <Hold> | `<Conference>` in `/api/twilio/hold/route.ts:197` | ✅ |
| `endConferenceOnExit="false"` | line 204 | ✅ |
| `startConferenceOnEnter="false"` for caller | line 203 | ✅ |
| `waitUrl` for hold music | line 201 | ✅ (but see §2.2.B) |
| Unique conference name | `park-<pstnSid>-<timestamp>` line 119 | ✅ |
| Conference `statusCallback` for cleanup | `/api/twilio/parking-status` | ✅ |
| Unpark redirects PSTN to `<Dial><Client>` | `/api/twilio/resume/route.ts` | ✅ |
| Cleanup parking slot on conference-end | `parkingLot.clearByConference` | ✅ |

### 2.2 What we get wrong ❌ — root causes of the incidents

#### A. Dual-leg SID has been fought four separate times in parking alone

Every time the PSTN/agent SID gap reappears it surfaces as a parking bug:

| Commit | Symptom | Fix layer |
|---|---|---|
| `48f31ea` | end-call route killed parked parent | route check |
| `81fb753` | endByCallSid returned `alreadyCleaned` for parked rows | mutation lookup |
| `98e1c11` | end-call's parked-guard couldn't find row | `getByTwilioSid` dual lookup |
| `d0a54a0` | parkByCallSid couldn't find row to patch state | `parkByCallSid` dual lookup |
| `f796ec1` | Even with state fixed, in some auth contexts the row was never patched | switch to authoritative `parkingLots` table |

This is a smell. Five fixes for one symptom means we don't have a clean architectural seam between "PSTN leg" and "agent leg" anywhere in the code. Every consumer has to reinvent the dual lookup or trust that someone else did.

**Actual root cause of the underlying smell:** `useTwilioDevice` only knows the **agent leg** SID (Twilio Voice SDK's `call.parameters.CallSid`). Every browser-to-server call carries that SID. Server-side code that needs the PSTN leg has to look it up via Twilio's REST API (`client.calls(agentSid).fetch().parentCallSid`) — an extra round-trip on every park, hangup, transfer, hold operation. We sometimes cache it (`activeCalls.twilioCallSid`, `parkingLots.pstnCallSid`), sometimes don't.

#### B. Hold-music URL inconsistency

- `/api/twilio/hold/route.ts:191` still uses `https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical`
- `/api/twilio/hold-music/route.ts` (after H4) uses `https://demo.twilio.com/docs/classic.mp3`
- `/api/twilio/transfer/route.ts` (after H1) uses `https://demo.twilio.com/docs/classic.mp3`

We migrated two of three call-paths off twimlets.com but missed parking. Inconsistent and twimlets.com is undocumented infrastructure with no SLA.

#### C. `parkByCallSid` had multiple silent-failure modes

Before today's fixes:
- Used single-index lookup → didn't find the row when called with the agent SID.
- The `if (call)` guard on the state patch silently no-opped if not found.
- The mutation returned `success: true` regardless — the route had no way to know parking didn't actually happen.

#### D. Parked calls were left attributed to the parking agent

Until commit `8d39a36` (today): `parkByCallSid` set `state="parked"` but left `assignedUserId` pointing at the parking agent. The dashboard's `callsByUser` map grouped the row under that agent. UserStatusCard's DB-fallback render then drew the call card under the agent's row, in addition to the parking-lot widget.

Combined with the new "skip delete if parking slot exists" guard (commit `f796ec1`), the in-card hangup button no-opped — the row was undeletable until the slot was cleared via `clearByConference` (which only fires when the caller hangs up themselves) or via the Diagnostics → Clear stuck calls button.

This is the bug you saw today: parked call duplicated in two UI places, hangup button dead.

#### E. Hold-route's `orgId` comes from Clerk active org

Same super-admin issue as the end-call route had pre-`48f31ea`. For a super admin viewing `/admin/tenants/[id]`, `getOrgTwilioClient(orgId)` will fetch the **super admin's own org** Twilio creds — almost certainly missing — and the route will 400 with "Twilio credentials not configured". I haven't reproduced this in your tests because your active Clerk org happens to be Kover King, but it's a latent bug that will bite a different super admin.

#### F. `participant-leave` triggers `clearByConference`

`/api/twilio/parking-status:33-50` fires `clearByConference` on **either** `participant-leave` or `conference-end`. With `endConferenceOnExit="false"`, an unpark causes `participant-leave` (the PSTN leg leaves the conference to join the agent). That'd fire the cleanup, deleting the parking slot — which is correct behavior. But it does mean the cleanup has to be idempotent and resilient to firing during an in-progress unpark.

---

## Part 3 — Remediation Plan

Today's commits (`f796ec1` + `8d39a36`) get the immediate symptoms off the production dashboard. The plan below tackles the structural issues so we stop fighting parking bugs every other week.

Each item is one PR-sized commit. Same one-PR-per-fix rule as Sprint 1.

### P1 — Make hold-music consistent (2 minutes) 🟢

**File:** `src/app/api/twilio/hold/route.ts`
Swap the twimlets.com URLs for `https://demo.twilio.com/docs/classic.mp3`. Same change H4+M5 made for `/hold-music` and `/transfer`.

Trivial; just removes the third-party dependency on a service Twilio doesn't formally own.

### P2 — Resolve org from the call row, not from Clerk active org (small) 🟡

**File:** `src/app/api/twilio/hold/route.ts`
Same pattern as `/api/twilio/end-call` after commit `48f31ea`: call `api.calls.getOrgByCallSid` first, fall back to `auth().orgId` only if not found. Closes the latent super-admin failure.

### P3 — Single source of truth for "PSTN leg SID" (medium) 🟡

**Files:** `convex/calls.ts`, `convex/schema.ts`, `convex/parkingLot.ts`, every consumer.

Promote `pstnCallSid` to a first-class field on `activeCalls` (already exists on `parkingLots`). Populate it the moment we know it (voice webhook for inbound; `<Dial><Number statusCallback>` for outbound). After this, **every** server-side consumer reads `pstnCallSid` directly — no more dual-index lookups, no more `client.calls(agentSid).fetch()` round-trips just to learn the parent SID.

This deletes the workarounds in:
- `endByCallSid` dual lookup
- `getByTwilioSid` dual lookup
- `parkByCallSid` dual lookup
- end-call route's `client.calls(agentSid).fetch()`
- hold route's same fetch
- transfer route's same fetch + child-list traversal

Net: ~150 lines removed, parking/transfer/hangup all stop having dual-leg bugs.

### P4 — Parking-slot operations are atomic Convex actions (medium) 🟡

**Files:** new `convex/calls.ts:parkAtomic` action, new `convex/calls.ts:unparkAtomic` action.

Right now parking is split across the route + multiple mutations + a Twilio REST call. Atomic Convex `action` functions can sequence "patch DB" and "POST Twilio" with a single failure-rollback. After P3, this becomes:

```ts
export const parkAtomic = action({
  args: { activeCallId, parkedByUserId },
  handler: async (ctx, args) => {
    // 1. Read activeCall (now has pstnCallSid).
    // 2. Reserve parking slot in Convex.
    // 3. Twilio update PSTN to <Conference>.
    // 4. On any failure, release the slot.
  },
});
```

Frontend just calls `await parkAtomic({...})`. End-to-end success or end-to-end rollback. Eliminates the "DB has the slot but Twilio failed" half-state we currently log-and-pray about.

### P5 — Voice SDK never sees the parent SID, full stop (small) 🟢

**Files:** `src/hooks/use-twilio-device.ts`, every `/api/twilio/*` route.

Stop trying to derive the PSTN SID from the browser. The browser passes its own (agent) SID; the **server** owns the mapping. Document this contract in a comment block at the top of the hook. Already mostly true; just needs the explicit contract so future code doesn't reinvent the dual-lookup wheel.

### P6 — Parking-status webhook idempotency hardening (small) 🟢

**File:** `src/app/api/twilio/parking-status/route.ts`

Today the webhook fires `clearByConference` on every `participant-leave`. During an unpark, that's exactly when we want it to fire. But during a glitchy reconnect or Twilio retry, it could fire mid-park. Make `clearByConference` idempotent (already is — it returns `{success:false, reason:"not_found"}` when the slot's gone) and add a comment explaining the unpark interaction.

### P7 — End-to-end test (medium) 🟡

**New:** `tests/calling/parking.spec.ts` (Playwright).

Three scenarios:
1. Park → wait 30s → unpark to a different agent → both parties talk → either hangs up.
2. Park → caller hangs up before unpark → slot frees, callHistory has `outcome: "answered"`.
3. Park while agent is on a second call → parking succeeds without affecting the second call.

Use Convex MCP `runOneoffQuery` between steps to assert DB state. This is the test that would have caught today's bug — the duplicated-card-state was visible in the DB before the user noticed it on the dashboard.

---

## Part 4 — Suggested Order

| # | Item | Risk | Reward |
|---|---|---|---|
| 1 | P1 (hold-music URL) | trivial | low |
| 2 | P2 (hold-route org resolution) | trivial | medium (latent bug) |
| 3 | P3 (`pstnCallSid` first-class field) | medium | **high** — eliminates the recurring root cause |
| 4 | P4 (atomic park/unpark actions) | medium | high |
| 5 | P6 (parking-status idempotency comment) | trivial | low |
| 6 | P5 (Voice SDK contract doc) | trivial | low |
| 7 | P7 (e2e tests) | medium | high — prevents regressions |

If you want to skip ahead and just kill the underlying problem, **P3 alone fixes ~80% of the recurring parking pain**. P4 makes the failure modes recoverable instead of silent.

---

## Part 5 — How to verify the production bug is fixed *right now*

Today's commits (`f796ec1`, `8d39a36`) should fix the reproduction:

1. Use the Diagnostics → "Clear stuck calls" button in tenant Settings to flush the currently-stuck row.
2. Wait for Railway to finish deploying (`8d39a36` should be live within ~90s of push).
3. Take a fresh inbound call.
4. Drag to parking.
5. **Expected:**
   - Call disappears from your user card.
   - Call appears in the parking lot widget with caller's number + "On hold — drag to agent".
   - Caller hears classical hold music (Twilio's `demo.twilio.com/docs/classic.mp3` after P1, currently still twimlets.com).
   - Convex `activeCalls` row exists, has `state="parked"`, `assignedUserId=undefined`, `parkingSlot=1`.
   - Convex `parkingLots` row has `isOccupied=true`, `pstnCallSid=<the parent SID>`, `conferenceName=park-…`.
6. Drag the parking-lot card to a different agent (or the same one). Caller's leg leaves the conference, rings the chosen agent, they answer, talk resumes.
7. Hang up from either side. Parking slot clears, callHistory row appears with the right disposition.

If any of the above is wrong, screenshot the network tab response for `/api/twilio/hold` AND copy the most recent rows from the Convex dashboard's `activeCalls` and `parkingLots` tables — that's enough to diagnose without another back-and-forth.

---

## Reference

- Twilio Conference TwiML: https://www.twilio.com/docs/voice/twiml/conference
- Modify a call in progress: https://www.twilio.com/docs/voice/api/call-resource#update-a-call-resource
- Twilio's Call Parking tutorial: https://www.twilio.com/docs/voice/tutorials/how-to-build-a-call-parking-lot
- Voice SDK Call object: https://www.twilio.com/docs/voice/sdks/javascript/twiliocall
- Our audit: `docs/calling-audit-2026-04-25.md`
