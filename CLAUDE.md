# VoIP CRM Project

## Overview
Multi-tenant SaaS VoIP CRM with real-time calling dashboard, drag-and-drop call management, and comprehensive call logging.

## Tech Stack
- **Frontend**: Next.js 15 (App Router)
- **Backend**: Convex (real-time database)
- **Auth**: Clerk (multi-tenant with organizations)
- **VoIP**: Twilio Voice SDK
- **UI**: shadcn/ui + Tailwind CSS
- **Deployment**: Vercel

## Key Directories
- `/src/app/(dashboard)/` - Protected dashboard routes
- `/src/app/api/twilio/` - Twilio webhook handlers
- `/src/components/calling/` - VoIP UI components
- `/src/hooks/` - Custom hooks (useTwilioDevice)
- `/convex/` - Database schema and functions

## Sub-Agents Available

### Core Platform Agents
- **twilio-expert**: Twilio Voice SDK, TwiML, webhooks, token generation
- **convex-expert**: Schema design, queries, mutations, real-time subscriptions
- **clerk-expert**: Multi-tenant auth, organizations, roles, webhooks
- **ui-designer**: shadcn/ui, Tailwind, component design, accessibility
- **saas-expert**: Multi-tenant architecture, tenant isolation, billing

### VoIP Specialized Agents
- **incoming-call-expert**: Device incoming events, multi-agent ring, call claiming, accept-first pattern
- **outbound-call-expert**: Device.connect(), TwiML App, E.164 formatting, status callbacks
- **parking-lot-expert**: Conference-based parking, URL-based TwiML redirects, hold music
- **call-transfer-expert**: Cold/warm transfers, PSTN redirection, transfer state machine
- **drag-drop-expert**: @dnd-kit integration, draggable calls, droppable zones, DragOverlay
- **sms-expert**: Twilio Messaging API, inbound/outbound SMS, conversation threading, MMS

## Setup Instructions

### 1. Environment Variables
Copy `.env.example` to `.env.local` and fill in:
- Clerk keys (from clerk.com dashboard)
- Convex URL (run `npx convex dev`)
- Twilio credentials (from twilio.com console)

### 2. Initialize Convex
```bash
npx convex dev
```

### 3. Configure Clerk Webhooks
Set webhook URL to: `https://your-convex-url.convex.site/clerk-webhook`

### 4. Configure Twilio
1. Create a TwiML App in Twilio Console
2. Set Voice URL to: `https://your-app.vercel.app/api/twilio/voice`
3. Set Status Callback to: `https://your-app.vercel.app/api/twilio/status`

### 5. Run Development Server
```bash
npm run dev
```

## Database Schema
See `/convex/schema.ts` for complete schema including:
- organizations (tenants)
- users (agents)
- activeCalls (real-time call state)
- callHistory (historical records)
- parkingLots (call parking slots)
- presence (real-time user status)
- contacts (CRM contacts)

## Features
- [x] Multi-tenant authentication
- [x] Real-time presence system
- [x] Incoming call notifications
- [x] Drag-and-drop call parking
- [x] Drag-and-drop call transfers
- [x] Call history logging
- [ ] Call recording playback
- [ ] IVR configuration
- [ ] Call queues

---

## Expert Agent Knowledge Base

### parking-lot-expert Patterns

**CRITICAL: Conference-Based Parking (NOT Simple Hold)**

Simple URL redirect to hold music does NOT work for call parking. The call will disconnect when the agent hangs up. You MUST use conference-based parking:

```typescript
// CORRECT: Conference-based parking
const conferenceName = `park-${twilioCallSid}-${Date.now()}`;
const twiml = `
  <Response>
    <Dial>
      <Conference
        waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"
        startConferenceOnEnter="true"
        endConferenceOnExit="false"
      >${conferenceName}</Conference>
    </Dial>
  </Response>
`;
await client.calls(twilioCallSid).update({ twiml });

// WRONG: Simple hold music redirect (call ends when agent disconnects)
// await client.calls(twilioCallSid).update({ url: holdMusicUrl });
```

**Key Attributes:**
- `endConferenceOnExit="false"` - Call persists after agent disconnects
- `waitUrl` - Plays hold music from Twilio twimlet
- `startConferenceOnEnter="true"` - Conference starts immediately

**Use twilioCallSid as Primary Identifier**

Never rely on Convex `_id` for parking operations. The call record may not exist in the database yet due to race conditions:

```typescript
// CORRECT: Use twilioCallSid
export const parkByCallSid = mutation({
  args: {
    twilioCallSid: v.string(),
    conferenceName: v.string(),
    callerNumber: v.string(),
    // ...
  },
  handler: async (ctx, args) => {
    // Find call by twilioCallSid, or create parking record without it
  },
});

// WRONG: Requiring Convex _id
// parkCallMutation({ callId: callId as Id<"activeCalls">, ... })
```

**Parking Lot Schema Must Store Conference Info**

```typescript
parkingLots: defineTable({
  organizationId: v.id("organizations"),
  slotNumber: v.number(),
  isOccupied: v.boolean(),
  conferenceName: v.optional(v.string()), // Required for unparking
  callerNumber: v.optional(v.string()),
  callerName: v.optional(v.string()),
  // ...
})
```

### drag-drop-expert Patterns

**Single Droppable Zone for Parking Lot**

Use one droppable for the entire parking lot, not individual slots:

```typescript
// CORRECT: Single droppable
const { setNodeRef, isOver } = useDroppable({
  id: "parking-lot",
  data: { type: "parking-lot" },
});

// WRONG: Per-slot droppables
// parking-1, parking-2, etc.
```

**DragOverlay Must Match Target Dimensions**

The dragged card should visually match the parking slot size:

```typescript
<DragOverlay>
  {dragActiveCall ? (
    <div className="w-56 flex items-center gap-3 rounded-md border p-3">
      {/* Match parking slot styling exactly */}
    </div>
  ) : null}
</DragOverlay>
```

**Use twilioCallSid for Draggable ID, Not Convex _id**

```typescript
// In useDraggable
const { ... } = useDraggable({
  id: call.twilioCallSid || call._id, // Prefer twilioCallSid
  data: {
    type: "active-call",
    call,
    twilioCallSid: call.twilioCallSid,
  },
});
```

**Optimistic Updates with Zustand Store**

```typescript
// 1. Add temp entry immediately
const tempId = generateTempParkingId();
addOptimisticCall({ id: tempId, twilioCallSid, ... });

// 2. Call Twilio API
const result = await fetch("/api/twilio/hold", { ... });

// 3. Save to database
await parkByCallSidMutation({ ... });

// 4. Remove temp entry (real one arrives via subscription)
removeOptimisticCall(tempId);
```

### twilio-expert Patterns

**Conference TwiML for Call Parking**

```xml
<Response>
  <Dial>
    <Conference
      waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"
      startConferenceOnEnter="true"
      endConferenceOnExit="false"
    >park-CA123-1234567890</Conference>
  </Dial>
</Response>
```

**Unparking a Call (Redirect Out of Conference)**

To unpark, redirect the participant to connect to the new agent:

```typescript
// Get participants in the conference
const participants = await client
  .conferences(conferenceSid)
  .participants
  .list();

// Redirect the parked caller to ring the new agent
for (const participant of participants) {
  await client
    .conferences(conferenceSid)
    .participants(participant.callSid)
    .update({
      url: ringAgentUrl,
      method: "POST",
    });
}
```

**Hold Music Options**

```
// Twilio Twimlet (free)
http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical
http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient
http://twimlets.com/holdmusic?Bucket=com.twilio.music.electronica

// Custom hold music endpoint
/api/twilio/hold-music (returns TwiML with <Play> and <Loop>)
```
