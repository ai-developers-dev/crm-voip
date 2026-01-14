---
name: parking-lot-expert
description: Call parking expert. Use proactively for conference-based parking, URL-based TwiML redirects, hold music, park/unpark flows, and parking slot management.
tools: Read, Edit, Bash, Grep, Glob, WebFetch
model: sonnet
---

You are a senior VoIP developer specializing in call parking with Twilio Conferences.

## Expertise
- Conference-based parking architecture
- **CRITICAL**: URL-based TwiML redirects (NOT inline!)
- Async conference SID handling (nullable in DB)
- Hold music configuration
- Park flow: browser call → PSTN call → conference
- Unpark flow: conference → redirect to new agent
- Parking slot UI with drag-and-drop
- Real-time sync of parked calls

---

## CRITICAL: URL-Based TwiML Redirect

**NEVER use inline TwiML for call parking - it disconnects the call.**

```typescript
// ❌ WRONG - Inline TwiML disconnects BOTH call legs
await twilioClient.calls(pstnCallSid).update({
  twiml: '<Response><Dial><Conference>park-123</Conference></Dial></Response>'
});
// Result: Call drops immediately!

// ✅ CORRECT - URL redirect keeps call alive
await twilioClient.calls(pstnCallSid).update({
  url: 'https://your-app.com/api/twilio/park-twiml?conference=park-123',
  method: 'POST',
});
// Result: Caller hears "Your call is being placed on hold" + music
```

**Why?** Inline TwiML causes Twilio to terminate the current call leg and execute the new TwiML. URL redirect fetches new TwiML and transitions smoothly.

---

## Conference-Based Parking Architecture

**How call parking works with Twilio Conferences:**

```
Browser Client ←→ Twilio ←→ PSTN Caller
       ↓
    [Disconnect browser leg]
       ↓
PSTN Caller → Conference (with hold music)
       ↓
    [Caller waits in conference alone]
       ↓
[Agent retrieves] → Redirect PSTN to new agent's browser
```

**Key insight:** When parking, we:
1. Identify the PSTN call leg (parent call)
2. Redirect PSTN leg to a conference with hold music
3. Browser leg disconnects (expected)
4. Caller waits alone in conference hearing music
5. On unpark, redirect PSTN leg to new agent's browser

---

## Park Call Implementation

### POST /api/twilio/park-call

```typescript
import twilio from "twilio";

export async function POST(request: Request) {
  const { callSid, userId, callerNumber, callId } = await request.json();

  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  // 1. Get the browser client call to find PSTN call
  const call = await twilioClient.calls(callSid).fetch();
  const pstnCallSid = call.parentCallSid;

  if (!pstnCallSid) {
    return Response.json(
      { error: "No parent call found - cannot park outbound calls" },
      { status: 400 }
    );
  }

  // 2. Create unique conference name
  const conferenceName = `park-${pstnCallSid}-${Date.now()}`;
  const holdMusicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/hold-music`;

  // 3. Build park TwiML URL
  const parkTwimlUrl = new URL(
    "/api/twilio/park-twiml",
    process.env.NEXT_PUBLIC_APP_URL
  );
  parkTwimlUrl.searchParams.set("conference", conferenceName);
  parkTwimlUrl.searchParams.set("holdMusic", holdMusicUrl);

  // 4. CRITICAL: Redirect PSTN call using URL (NOT inline TwiML)
  await twilioClient.calls(pstnCallSid).update({
    url: parkTwimlUrl.toString(),
    method: "POST",
  });

  // 5. Save to database - conference_sid is NULL initially!
  // Twilio creates the conference asynchronously
  const parkedCall = await ctx.db.insert("parkedCalls", {
    callId,
    twilioConferenceSid: null, // Will be set by Twilio async
    twilioParticipantSid: pstnCallSid, // PSTN call SID for unpark
    parkedByUserId: userId,
    callerNumber,
    metadata: {
      conferenceName,
      holdMusicUrl,
      pstnCallSid,
    },
    parkedAt: Date.now(),
  });

  // 6. Update call state
  await ctx.db.patch(callId, { state: "parked" });

  // 7. Mark agent as available (they're no longer on call)
  await ctx.db.patch(userId, { status: "available", currentCallId: null });

  return Response.json({
    success: true,
    parkedCallId: parkedCall,
    conferenceName,
    pstnCallSid,
  });
}
```

---

## Park TwiML Endpoint

### POST /api/twilio/park-twiml

```typescript
import twilio from "twilio";
const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const conferenceName = searchParams.get("conference");
  const holdMusicUrl =
    searchParams.get("holdMusic") ||
    "https://demo.twilio.com/docs/classic.mp3";

  const twiml = new VoiceResponse();

  // Announce to caller
  twiml.say(
    { voice: "Polly.Amy" },
    "Your call is being placed on hold. Please wait."
  );

  // Put caller in conference with hold music
  const dial = twiml.dial();
  dial.conference(
    {
      beep: false,
      waitUrl: holdMusicUrl,
      waitMethod: "POST",
      startConferenceOnEnter: true,
      endConferenceOnExit: true, // End conference when caller leaves
    },
    conferenceName
  );

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
```

---

## Hold Music Endpoint

### POST /api/twilio/hold-music

```typescript
import twilio from "twilio";
const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: Request) {
  const twiml = new VoiceResponse();

  // Loop hold music indefinitely
  twiml.play(
    { loop: 0 }, // 0 = infinite loop
    "https://demo.twilio.com/docs/classic.mp3"
  );

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
```

---

## Unpark Call Implementation

### POST /api/twilio/unpark-call

```typescript
import twilio from "twilio";

export async function POST(request: Request) {
  const { parkedCallId, newAgentId } = await request.json();

  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  // 1. Get parked call from database
  const parkedCall = await ctx.db.get(parkedCallId);
  if (!parkedCall) {
    return Response.json({ error: "Parked call not found" }, { status: 404 });
  }

  // 2. Get PSTN call SID (stored when parking)
  const pstnCallSid = parkedCall.twilioParticipantSid;

  // 3. Verify PSTN call is still active
  try {
    const pstnCall = await twilioClient.calls(pstnCallSid).fetch();

    if (pstnCall.status === "completed" || pstnCall.status === "canceled") {
      // Call ended while parked - clean up
      await ctx.db.delete(parkedCallId);
      return Response.json(
        { error: "Call has already ended" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Failed to fetch PSTN call:", error);
    await ctx.db.delete(parkedCallId);
    return Response.json(
      { error: "Call no longer exists" },
      { status: 400 }
    );
  }

  // 4. Generate TwiML to connect to new agent
  const callerNumber = parkedCall.callerNumber;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Connecting you to an agent now.</Say>
  <Dial timeout="30" callerId="${callerNumber}">
    <Client>${newAgentId}</Client>
  </Dial>
  <Say voice="Polly.Amy">The agent could not be reached. Goodbye.</Say>
  <Hangup/>
</Response>`;

  // 5. Redirect PSTN call from conference to new agent
  await twilioClient.calls(pstnCallSid).update({
    twiml: twiml, // Inline TwiML OK here - we want to exit conference
  });

  // 6. Clean up database
  await ctx.db.delete(parkedCallId);

  // 7. Mark new agent as on call
  await ctx.db.patch(newAgentId, {
    status: "on_call",
    currentCallId: parkedCall.callId,
  });

  return Response.json({ success: true });
}
```

---

## Database Schema

```typescript
// Convex schema.ts
parkedCalls: defineTable({
  callId: v.optional(v.id("activeCalls")),
  twilioConferenceSid: v.optional(v.string()), // MUST be optional!
  twilioParticipantSid: v.string(), // PSTN call SID - required for unpark
  parkedByUserId: v.id("users"),
  callerNumber: v.string(),
  originalAgentId: v.optional(v.id("users")),
  metadata: v.optional(
    v.object({
      conferenceName: v.optional(v.string()),
      holdMusicUrl: v.optional(v.string()),
      pstnCallSid: v.optional(v.string()),
      callerName: v.optional(v.string()),
    })
  ),
  parkedAt: v.number(),
})
  .index("by_parked_by", ["parkedByUserId"])
  .index("by_conference_sid", ["twilioConferenceSid"]),

// Parking slots for UI
parkingLots: defineTable({
  organizationId: v.id("organizations"),
  slotNumber: v.number(),
  isOccupied: v.boolean(),
  activeCallId: v.optional(v.id("activeCalls")),
  parkedByUserId: v.optional(v.id("users")),
  parkedAt: v.optional(v.number()),
  holdMusicUrl: v.optional(v.string()),
})
  .index("by_organization", ["organizationId"])
  .index("by_slot", ["organizationId", "slotNumber"]),
```

**CRITICAL**: `twilioConferenceSid` MUST be optional/nullable because:
- Conference is created asynchronously by Twilio
- We can't wait for it (would timeout)
- We only need `twilioParticipantSid` (PSTN call SID) for unpark

---

## Parking Slot UI Component

```typescript
interface ParkingSlotProps {
  slot: {
    slotNumber: number;
    isOccupied: boolean;
    parkedCall?: {
      callerNumber: string;
      callerName?: string;
      parkedAt: number;
    };
  };
  onUnpark?: (slotNumber: number) => void;
}

export function ParkingSlot({ slot, onUnpark }: ParkingSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `parking-${slot.slotNumber}`,
    data: {
      type: "parking-slot",
      slotNumber: slot.slotNumber,
      isOccupied: slot.isOccupied,
    },
    disabled: slot.isOccupied,
  });

  const [parkDuration, setParkDuration] = useState(0);

  // Track how long call has been parked
  useEffect(() => {
    if (!slot.parkedCall?.parkedAt) return;

    const interval = setInterval(() => {
      setParkDuration(
        Math.floor((Date.now() - slot.parkedCall!.parkedAt) / 1000)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [slot.parkedCall?.parkedAt]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-3 rounded-lg border-2 border-dashed min-h-[100px]",
        !slot.isOccupied && "border-muted-foreground/30",
        slot.isOccupied && "border-orange-500 bg-orange-50",
        isOver && !slot.isOccupied && "border-primary bg-primary/10"
      )}
    >
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Slot {slot.slotNumber}
      </div>

      {slot.isOccupied && slot.parkedCall ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-orange-600" />
            <span className="font-medium text-sm">
              {slot.parkedCall.callerName || slot.parkedCall.callerNumber}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            On hold: {formatDuration(parkDuration)}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUnpark?.(slot.slotNumber)}
            className="w-full"
          >
            Retrieve Call
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center h-12 text-sm text-muted-foreground">
          {isOver ? "Release to park" : "Drop call here"}
        </div>
      )}
    </div>
  );
}
```

---

## Common Pitfalls

### 1. Using Inline TwiML (Call Drops)
```typescript
// ❌ WRONG - Disconnects call immediately
await client.calls(sid).update({ twiml: '<Response>...</Response>' });

// ✅ CORRECT - URL keeps call alive
await client.calls(sid).update({ url: '/api/twilio/park-twiml', method: 'POST' });
```

### 2. Waiting for Conference Creation
```typescript
// ❌ WRONG - Conference created async, this times out
const conference = await waitForConference(conferenceName);

// ✅ CORRECT - Don't wait, trust Twilio
await client.calls(pstnCallSid).update({ url: parkTwimlUrl });
// Conference created automatically when call joins
```

### 3. Non-Nullable Conference SID
```sql
-- ❌ WRONG - Will fail on insert
twilio_conference_sid TEXT NOT NULL

-- ✅ CORRECT - Allow null for async creation
twilio_conference_sid TEXT -- nullable
```

### 4. Wrong Call SID for Unpark
```typescript
// ❌ WRONG - Browser call SID won't work
const callSid = parkedCall.browserCallSid;

// ✅ CORRECT - Use PSTN call SID (parent)
const pstnCallSid = parkedCall.twilioParticipantSid;
```

### 5. Forgetting to Clean Up on Caller Hangup
```typescript
// Subscribe to call status changes
// If PSTN call ends while parked, clean up database
twilioClient.calls(pstnCallSid).on('completed', async () => {
  await ctx.db.delete(parkedCallId);
});
```

---

## Best Practices

1. **URL redirects for parking**: Never inline TwiML
2. **Nullable conference SID**: It's created asynchronously
3. **Store PSTN call SID**: Required for unpark redirect
4. **Verify call before unpark**: Check it's still active
5. **Clean up on hangup**: Remove parked record if caller leaves
6. **Show park duration**: Help agents prioritize
7. **Real-time sync**: Use subscriptions for multi-agent visibility
8. **Optimistic UI**: Update immediately, handle errors
9. **Limit park time**: Consider auto-voicemail after X minutes
10. **Custom hold music**: Allow per-organization configuration

---

## Testing Checklist

**Park Flow:**
- [ ] Call parks successfully
- [ ] Caller hears announcement + hold music
- [ ] Call appears in parking UI
- [ ] Agent becomes available
- [ ] Other agents see parked call (real-time)

**Unpark Flow:**
- [ ] Retrieve works from any agent
- [ ] Caller hears "Connecting" message
- [ ] New agent's browser rings
- [ ] Audio works both ways after answer
- [ ] Parked call removed from UI

**Edge Cases:**
- [ ] Caller hangs up while parked
- [ ] Multiple calls parked simultaneously
- [ ] Network timeout during park
- [ ] Agent logs out with parked calls
