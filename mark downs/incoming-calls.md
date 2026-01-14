# Incoming Calls System Documentation

This document covers everything learned from studying the reference VoIP CRM codebase about handling incoming calls with Twilio Voice SDK.

---

## Table of Contents

1. [Twilio Device Initialization](#1-twilio-device-initialization)
2. [Incoming Call Flow](#2-incoming-call-flow)
3. [UI Components](#3-ui-components)
4. [Answer/Decline Flow](#4-answerdecline-flow)
5. [Call State Management](#5-call-state-management)
6. [Ringtone/Audio](#6-ringtoneaudio)
7. [Cleanup and Disconnect](#7-cleanup-and-disconnect)
8. [Multi-Agent Handling](#8-multi-agent-handling)
9. [Database Tables](#9-database-tables)
10. [Key Insights](#10-key-insights)

---

## 1. Twilio Device Initialization

The Twilio Device is initialized in a **Context Provider** that wraps the entire application, ensuring the device persists across page navigation.

### Token Generation (Convex Action)

```typescript
// convex/twilio.ts
export const generateToken = action({
  args: {},
  handler: async (ctx: ActionCtx): Promise<{ token: string; identity: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: No authenticated user");
    }

    const user = await ctx.runQuery(internal.users.getByExternalAuthIdInternal, {
      externalAuthId: identity.subject,
    });

    if (!user) {
      throw new Error("User not found in database");
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

    const twilio = await import("twilio");
    const AccessToken = twilio.default.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // Create access token with 4-hour TTL
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: user._id,  // Use Convex user ID as identity
      ttl: 14400, // 4 hours
    });

    // Create voice grant
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,  // CRITICAL: Enable incoming calls
    });

    token.addGrant(voiceGrant);

    return {
      token: token.toJwt(),
      identity: user._id,
    };
  },
});
```

### Device Creation (TwilioDeviceContext.tsx)

```typescript
'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react'
import { Device, Call } from '@twilio/voice-sdk'

export function TwilioDeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Device | null>(null)
  const [incomingCall, setIncomingCall] = useState<Call | null>(null)
  const [activeCall, setActiveCall] = useState<Call | null>(null)
  const [isRegistered, setIsRegistered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deviceRef = useRef<Device | null>(null)
  const initializationRef = useRef<boolean>(false)
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!isSignedIn) return

    // Prevent double initialization in React Strict Mode
    if (initializationRef.current && deviceRef.current) {
      return
    }
    initializationRef.current = true

    async function initializeDevice() {
      const data = await generateToken()

      const twilioDevice = new Device(data.token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        tokenRefreshMs: 30000,
      })

      // Event listeners
      twilioDevice.on('registered', () => {
        setIsRegistered(true)
      })

      twilioDevice.on('incoming', async (call) => {
        // Play ringtone
        if (ringtoneRef.current) {
          ringtoneRef.current.currentTime = 0
          ringtoneRef.current.play().catch(err => {
            console.log('Ringtone blocked:', err.message)
          })
        }

        // Show incoming call UI immediately
        setIncomingCall(call)

        // Setup call event handlers
        call.on('accept', () => {
          ringtoneRef.current?.pause()
          setActiveCall(call)
          setIncomingCall(null)
        })

        call.on('disconnect', () => {
          ringtoneRef.current?.pause()
          setActiveCall(null)
          setIncomingCall(null)
        })

        call.on('cancel', () => {
          ringtoneRef.current?.pause()
          setIncomingCall(null)
        })
      })

      twilioDevice.on('tokenWillExpire', async () => {
        const data = await generateToken()
        twilioDevice.updateToken(data.token)
      })

      await twilioDevice.register()
      deviceRef.current = twilioDevice
      setDevice(twilioDevice)
    }

    initializeDevice()

    return () => {
      if (deviceRef.current) {
        deviceRef.current.unregister()
        deviceRef.current.destroy()
        deviceRef.current = null
      }
      initializationRef.current = false
    }
  }, [isSignedIn, generateToken])

  const acceptCall = () => {
    if (incomingCall) {
      incomingCall.accept()
    }
  }

  const rejectCall = () => {
    if (incomingCall) {
      incomingCall.reject()
      setIncomingCall(null)
    }
  }

  // ... rest of provider
}
```

---

## 2. Incoming Call Flow

### Complete Sequence

1. **PSTN caller dials Twilio number**
2. **Twilio sends webhook to voice endpoint** - Creates call record in database
3. **Voice webhook returns TwiML** - Dials to `<Client>` with agent identity
4. **Twilio Device receives `incoming` event**
5. **UI shows incoming call notification**
6. **Agent clicks Answer** - `call.accept()` called
7. **Audio connection established**
8. **Call claimed in database** (background, non-blocking)

### Voice Webhook TwiML

```typescript
// Critical: Check if call is FROM browser client (outbound) or FROM PSTN (inbound)
const isOutboundFromBrowser = from && from.startsWith("client:");

if (isOutboundFromBrowser && to && !to.startsWith("client:")) {
  // Outbound call from browser to PSTN
  twiml.dial({ callerId: twilioNumber }, to);
} else {
  // Inbound call from PSTN - dial to browser clients
  const dial = twiml.dial({
    callerId: from || twilioNumber,
    timeout: 30,
    action: `${baseUrl}/api/twilio/call-status`,
  });

  // Dial to ALL registered agents (multi-ring)
  for (const user of users) {
    dial.client(`${clerkOrgId}-${user.clerkUserId}`);
  }
}
```

---

## 3. UI Components

### IncomingCallCard (Simple Display Component)

```tsx
export default function IncomingCallCard({ callerNumber, contactName }: IncomingCallCardProps) {
  const formatPhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 11 && digits[0] === '1') {
      const number = digits.slice(1)
      return `${number.slice(0, 3)}-${number.slice(3, 6)}-${number.slice(6)}`
    }
    return phone.replace('+', '')
  }

  return (
    <div className="p-3 bg-gradient-to-br from-orange-50/90 to-yellow-50/90 border-2 border-orange-300 rounded-xl animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center">
          <PhoneIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-orange-700 uppercase">Incoming Call</p>
          {contactName && (
            <p className="text-base font-bold text-orange-900">{contactName}</p>
          )}
          <p className="font-bold font-mono text-orange-900">
            {formatPhoneNumber(callerNumber)}
          </p>
        </div>
      </div>
    </div>
  )
}
```

### AgentCard Inline Incoming Call Display

The AgentCard component shows incoming calls directly inline when an agent has a ringing call:

```tsx
{/* Incoming Call - Inline compact card */}
{incomingCall && !activeCall && (
  <div className="flex-shrink-0 backdrop-blur-md bg-gradient-to-br from-blue-50/90 to-indigo-50/90 border-2 border-blue-400 rounded-lg px-3 py-2 flex items-center gap-2">
    <div className="flex items-center gap-2">
      <PhoneIcon className="w-4 h-4 text-blue-600" />
      <div>
        <div className="text-xs font-semibold text-blue-700 uppercase">Incoming</div>
        {incomingCall.contactName && (
          <div className="text-sm font-bold text-blue-900">{incomingCall.contactName}</div>
        )}
        <div className="font-bold font-mono text-blue-900">
          {formatPhoneNumber(incomingCall.callerNumber)}
        </div>
      </div>
    </div>
    {onAnswerCall && onDeclineCall && (
      <div className="flex items-center gap-1.5 ml-2">
        <button onClick={onAnswerCall} className="bg-green-500 hover:bg-green-600 text-white p-1.5 rounded-md">
          <PhoneIcon className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDeclineCall} className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-md">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    )}
  </div>
)}
```

### Dashboard-Level Incoming Call Bar

For multi-agent setups, a prominent bar at the top of the dashboard:

```tsx
{incomingCall && !activeCall && currentUserId && incomingCallMap[currentUserId] && (
  <div className="mb-6 backdrop-blur-md bg-gradient-to-br from-blue-50/90 to-indigo-50/90 border-2 border-blue-400 rounded-2xl shadow-2xl p-6 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
          <PhoneIcon className="w-10 h-10 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-700 uppercase">Incoming Call</p>
          {incomingCallContact && (
            <p className="text-xl font-bold text-blue-900">{incomingCallContact.displayName}</p>
          )}
          <p className="text-2xl font-bold font-mono text-blue-900">
            {formatPhoneNumber(incomingCallMap[currentUserId].callerNumber)}
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={handleAnswerCall} className="bg-green-500 hover:bg-green-600 text-white py-4 px-8 rounded-xl">
          Answer
        </button>
        <button onClick={handleDeclineCall} className="bg-red-500 hover:bg-red-600 text-white py-4 px-8 rounded-xl">
          Decline
        </button>
      </div>
    </div>
  </div>
)}
```

---

## 4. Answer/Decline Flow

### handleAnswerCall - ACCEPT FIRST Pattern

**Key Insight**: Accept the call FIRST for faster audio connection, then claim in the background.

```typescript
const handleAnswerCall = async () => {
  if (!incomingCall || !currentUserId) return

  const callSid = incomingCall.parameters.CallSid
  const incomingCallInfo = incomingCallMap[currentUserId]
  const callerNumber = incomingCallInfo?.callerNumber || incomingCall.parameters.From
  const contactName = incomingCallContact?.displayName
  const isTransfer = incomingCallInfo?.isTransfer || false

  // Show "Connecting..." state immediately
  setConnectingCallMap({
    [currentUserId]: { callerNumber, contactName }
  })

  // Clear incoming call UI
  setIncomingCallMap({})

  // ACCEPT FIRST for faster audio connection
  console.log('Accepting call IMMEDIATELY to establish audio connection')
  acceptCall()  // This calls incomingCall.accept()

  // For regular multi-agent calls, claim in background (non-blocking)
  if (!isTransfer) {
    try {
      const claimResult = await claimCallMutation({ callSid })

      if (!claimResult.success) {
        // Another agent claimed this call - disconnect
        console.log('Another agent claimed this call - disconnecting')
        if (activeCall) {
          activeCall.disconnect()
        }
        setConnectingCallMap({})
      }
    } catch (error) {
      console.error('Error claiming call:', error)
    }
  }
}
```

### handleDeclineCall

```typescript
const handleDeclineCall = async () => {
  if (!incomingCall || !currentUserId) return

  const callSid = incomingCall.parameters.CallSid

  // Record decline event for multi-agent coordination
  await recordDeclineMutation({ callSid })

  // Reject via Twilio SDK
  await rejectCall()  // This calls incomingCall.reject()

  // Clear UI
  setIncomingCallMap({})
}
```

---

## 5. Call State Management

### State Variables

```typescript
// In TwilioDeviceContext
const [device, setDevice] = useState<Device | null>(null)
const [incomingCall, setIncomingCall] = useState<Call | null>(null)
const [activeCall, setActiveCall] = useState<Call | null>(null)
const [activeCalls, setActiveCalls] = useState<CallState[]>([])
const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
const [isRegistered, setIsRegistered] = useState(false)
const [error, setError] = useState<string | null>(null)
const [currentUserId, setCurrentUserId] = useState<string | null>(null)
const [callStartTime, setCallStartTime] = useState<Date | null>(null)
const [outboundCall, setOutboundCall] = useState<Call | null>(null)
const [outboundCallStatus, setOutboundCallStatus] = useState<string | null>(null)
const [incomingCallContact, setIncomingCallContact] = useState<ContactInfo | null>(null)
const [activeCallContact, setActiveCallContact] = useState<ContactInfo | null>(null)

// In CallingDashboard
const [incomingCallMap, setIncomingCallMap] = useState<Record<string, IncomingCallInfo>>({})
const [optimisticTransferMap, setOptimisticTransferMap] = useState<Record<string, TransferInfo>>({})
const [connectingCallMap, setConnectingCallMap] = useState<Record<string, ConnectingInfo>>({})
const [pendingTransferTo, setPendingTransferTo] = useState<string | null>(null)
const pendingTransferToRef = useRef<string | null>(null)
const [processedTransferCallSids, setProcessedTransferCallSids] = useState<Set<string>>(new Set())
```

### Refs for Closure Issues

```typescript
// Refs to avoid stale closure issues in event handlers
const incomingCallContactRef = useRef<ContactInfo | null>(null)
const activeCallContactRef = useRef<ContactInfo | null>(null)
const deviceRef = useRef<Device | null>(null)
const userIdRef = useRef<string | null>(null)
const initializationRef = useRef<boolean>(false)
const ringtoneRef = useRef<HTMLAudioElement | null>(null)
const audioPrewarmedRef = useRef<boolean>(false)
```

### incomingCall vs activeCall

- **incomingCall**: Set when `device.on('incoming')` fires. Represents a ringing call waiting to be answered.
- **activeCall**: Set when `call.on('accept')` fires. Represents an answered, connected call with audio.

```typescript
// Transition from incoming to active
call.on('accept', () => {
  setActiveCall(call)
  setIncomingCall(null)
  setCallStartTime(new Date())

  // Transfer contact info from incoming to active
  const currentContact = incomingCallContactRef.current
  setActiveCallContact(currentContact)
  activeCallContactRef.current = currentContact
  setIncomingCallContact(null)
  incomingCallContactRef.current = null
})
```

---

## 6. Ringtone/Audio

### Ringtone Setup

```typescript
// Initialize ringtone audio element
useEffect(() => {
  if (typeof window !== 'undefined') {
    ringtoneRef.current = new Audio('/ringtone.mp3')
    ringtoneRef.current.loop = true
    ringtoneRef.current.volume = 0.5
  }
  return () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause()
      ringtoneRef.current = null
    }
  }
}, [])
```

### Play on Incoming Call

```typescript
twilioDevice.on('incoming', async (call) => {
  // Play ringtone
  if (ringtoneRef.current) {
    ringtoneRef.current.currentTime = 0
    ringtoneRef.current.play().catch(err => {
      console.log('Ringtone blocked:', err.message)
    })
  }

  setIncomingCall(call)
  // ... rest of handler
})
```

### Stop on Accept/Reject/Cancel

```typescript
call.on('accept', () => {
  if (ringtoneRef.current) {
    ringtoneRef.current.pause()
    ringtoneRef.current.currentTime = 0
  }
  // ... rest of handler
})

call.on('disconnect', () => {
  if (ringtoneRef.current) {
    ringtoneRef.current.pause()
    ringtoneRef.current.currentTime = 0
  }
  // ... rest of handler
})

call.on('cancel', () => {
  if (ringtoneRef.current) {
    ringtoneRef.current.pause()
    ringtoneRef.current.currentTime = 0
  }
  // ... rest of handler
})
```

### Pre-warming Microphone Permissions

```typescript
// Pre-warm microphone permissions on first user interaction
useEffect(() => {
  if (typeof window === 'undefined') return

  const prewarmAudio = async () => {
    if (audioPrewarmedRef.current) return
    audioPrewarmedRef.current = true

    try {
      console.log('Pre-warming microphone permissions...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      console.log('Microphone permissions pre-acquired - calls will connect faster')
    } catch (err) {
      console.log('Could not pre-warm microphone:', err)
      audioPrewarmedRef.current = false
    }
  }

  const handleInteraction = () => {
    prewarmAudio()
  }

  document.addEventListener('click', handleInteraction, { once: true })
  document.addEventListener('keydown', handleInteraction, { once: true })

  return () => {
    document.removeEventListener('click', handleInteraction)
    document.removeEventListener('keydown', handleInteraction)
  }
}, [])
```

---

## 7. Cleanup and Disconnect

### Call Disconnect Handler

```typescript
call.on('disconnect', async () => {
  console.log('Call disconnected:', callSid)

  // Stop ringtone
  if (ringtoneRef.current) {
    ringtoneRef.current.pause()
    ringtoneRef.current.currentTime = 0
  }

  // Update database - clear user's current call
  if (userIdRef.current) {
    try {
      await clearCurrentCall({ userId: userIdRef.current as any })
      console.log('Database updated - current_call_id cleared')
    } catch (error) {
      console.error('Error updating database on disconnect:', error)
    }
  }

  // Update state
  setActiveCalls(prev => prev.filter(c => c.callSid !== callSid))
  setIncomingCall(null)
  setActiveCall(null)
  setCallStartTime(null)
  setActiveCallContact(null)
  activeCallContactRef.current = null
})
```

### Device Cleanup on Unmount

```typescript
return () => {
  mounted = false

  if (registrationTimer) {
    clearTimeout(registrationTimer)
  }

  if (refreshTimer) {
    clearInterval(refreshTimer)
  }

  if (deviceRef.current) {
    console.log('TwilioDeviceProvider unmounting - cleaning up device')
    deviceRef.current.unregister()
    deviceRef.current.destroy()
    deviceRef.current = null
  }

  initializationRef.current = false
}
```

### Frontend Cleanup API Endpoint

Create an API endpoint for frontend-triggered cleanup:

```typescript
// src/app/api/twilio/end-call/route.ts
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { twilioCallSid } = await request.json();

  // End the call in Convex and move to history
  const result = await convex.mutation(api.calls.endByCallSid, {
    twilioCallSid,
  });

  return NextResponse.json(result);
}
```

---

## 8. Multi-Agent Handling

### incomingCallMap Pattern

Map incoming calls to EACH available agent:

```typescript
const [incomingCallMap, setIncomingCallMap] = useState<Record<string, {
  callSid: string
  callerNumber: string
  twilioCall: any
  isTransfer: boolean
  contactName?: string | null
}>>({})

// When incoming call arrives
useEffect(() => {
  if (incomingCall && !activeCall) {
    const callSid = incomingCall.parameters.CallSid

    // Check if this is a transfer (targeted to specific agent)
    if (pendingTransferToRef.current && !processedTransferCallSids.has(callSid)) {
      const targetAgentId = pendingTransferToRef.current

      // Show ONLY to target agent
      setIncomingCallMap({
        [targetAgentId]: {
          callSid,
          callerNumber: incomingCall.parameters.From || 'Unknown',
          twilioCall: incomingCall,
          isTransfer: true,
          contactName: incomingCallContact?.displayName || null
        }
      })

      pendingTransferToRef.current = null
    } else {
      // Multi-agent ring - show to ALL available agents
      const newMap: Record<string, any> = {}
      users.forEach(user => {
        if (user.is_available && !user.current_call_id) {
          newMap[user.id] = {
            callSid,
            callerNumber: incomingCall.parameters.From || 'Unknown',
            twilioCall: incomingCall,
            isTransfer: false,
            contactName: incomingCallContact?.displayName || null
          }
        }
      })
      setIncomingCallMap(newMap)
    }
  } else if (!incomingCall || activeCall) {
    setIncomingCallMap({})
  }
}, [incomingCall, activeCall, users, pendingTransferTo])
```

### Race Condition Prevention with Call Claims

```typescript
// convex/callClaims.ts
export const claim = mutation({
  args: {
    callSid: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)

    // Check if call is already claimed
    const existingClaim = await ctx.db
      .query("callClaims")
      .withIndex("by_call_sid", (q) => q.eq("callSid", args.callSid))
      .first()

    if (existingClaim) {
      // Check if the existing claim is expired
      if (existingClaim.status === "claimed" && existingClaim.expiresAt) {
        if (existingClaim.expiresAt > Date.now()) {
          // Still valid, claim failed
          return {
            success: false,
            claimedBy: existingClaim.claimedBy,
            reason: "already_claimed",
          }
        }
        // Expired, update the claim
        await ctx.db.patch(existingClaim._id, {
          claimedBy: user._id,
          status: "claimed",
          expiresAt: Date.now() + 30000, // 30 second expiry
        })
        return { success: true, claimId: existingClaim._id }
      }
    }

    // Create new claim
    const claimId = await ctx.db.insert("callClaims", {
      callSid: args.callSid,
      claimedBy: user._id,
      status: "claimed",
      expiresAt: Date.now() + 30000,
      createdAt: Date.now(),
    })

    return { success: true, claimId }
  },
})
```

### Ring Events for Multi-Agent Coordination

```typescript
// Subscribe to ring events via Convex real-time
useEffect(() => {
  if (!currentUserId || !recentRingEvents) return

  recentRingEvents.forEach((event: any) => {
    // If someone else answered, cancel our incoming ring
    if (event.eventType === 'answered' && event.agentId !== currentUserId) {
      console.log('Another agent answered, canceling our ring')
      setIncomingCallMap({})
    }

    // Clear optimistic transfer UI when call answered
    if (event.eventType === 'answered') {
      setOptimisticTransferMap({})
    }

    // Handle ring_cancel (caller hung up)
    if (event.eventType === 'ring_cancel') {
      console.log('Caller hung up - clearing all incoming call UIs')
      setIncomingCallMap({})
    }

    // Handle transfer targeting this agent
    if (event.eventType === 'transfer_start' && event.agentId === currentUserId) {
      pendingTransferToRef.current = currentUserId
      setPendingTransferTo(currentUserId)
    }
  })
}, [currentUserId, recentRingEvents])
```

---

## 9. Database Tables

### calls Table

```typescript
calls: defineTable({
  organizationId: v.id("organizations"),
  twilioCallSid: v.string(),
  fromNumber: v.string(),
  toNumber: v.string(),
  answeredByUserId: v.optional(v.id("users")),
  assignedTo: v.optional(v.id("users")),
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  status: v.union(
    v.literal("ringing"),
    v.literal("in-progress"),
    v.literal("completed"),
    v.literal("busy"),
    v.literal("no-answer"),
    v.literal("canceled"),
    v.literal("failed")
  ),
  duration: v.optional(v.number()),
  recordingUrl: v.optional(v.string()),
  startedAt: v.number(),
  answeredAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
})
  .index("by_organization", ["organizationId"])
  .index("by_twilio_sid", ["twilioCallSid"])
  .index("by_status", ["status"])
  .index("by_org_and_status", ["organizationId", "status"])
```

### callClaims Table

```typescript
callClaims: defineTable({
  callSid: v.string(),
  claimedBy: v.optional(v.id("users")),
  status: v.union(
    v.literal("pending"),
    v.literal("claimed"),
    v.literal("expired")
  ),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_call_sid", ["callSid"])
  .index("by_status", ["status"])
  .index("by_claimed_by", ["claimedBy"])
```

### ringEvents Table

```typescript
ringEvents: defineTable({
  callSid: v.string(),
  agentId: v.id("users"),
  eventType: v.union(
    v.literal("ring_start"),
    v.literal("ring_cancel"),
    v.literal("answered"),
    v.literal("declined"),
    v.literal("transfer_start")
  ),
  createdAt: v.number(),
})
  .index("by_call_sid", ["callSid"])
  .index("by_agent", ["agentId"])
  .index("by_created_at", ["createdAt"])
```

### activeCalls Table

```typescript
activeCalls: defineTable({
  callSid: v.string(),
  agentId: v.id("users"),
  callerNumber: v.optional(v.string()),
  status: v.union(
    v.literal("ringing"),
    v.literal("active"),
    v.literal("parked"),
    v.literal("transferring")
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_call_sid", ["callSid"])
  .index("by_agent", ["agentId"])
  .index("by_status", ["status"])
```

### parkedCalls Table

```typescript
parkedCalls: defineTable({
  callId: v.optional(v.id("calls")),
  twilioConferenceSid: v.optional(v.string()),
  twilioParticipantSid: v.optional(v.string()),
  parkedByUserId: v.id("users"),
  callerNumber: v.string(),
  originalAgentId: v.optional(v.id("users")),
  metadata: v.optional(v.object({
    conferenceName: v.optional(v.string()),
    holdMusicUrl: v.optional(v.string()),
    pstnCallSid: v.optional(v.string()),
    parkedByName: v.optional(v.string()),
    callerName: v.optional(v.string()),
    contactId: v.optional(v.string()),
  })),
  parkedAt: v.number(),
})
  .index("by_parked_by", ["parkedByUserId"])
  .index("by_conference_sid", ["twilioConferenceSid"])
```

---

## 10. Key Insights

### 1. Single Source of Truth: Twilio SDK

Use the Twilio SDK (`incomingCall` from Device) as the single source of truth for incoming calls, NOT database queries. This prevents duplicate UI elements.

```typescript
// GOOD - Only show if Twilio SDK has an incoming call
const isIncomingCall = twilioActiveCall &&
  twilioActiveCall.direction === "INCOMING" &&
  twilioActiveCall.status &&
  twilioActiveCall.status() === "pending"

if (!isIncomingCall) return null
```

### 2. Accept First, Claim Later

Accept the call immediately for faster audio connection. Claim in the background to prevent race conditions, but don't block audio on claim result.

```typescript
// ACCEPT FIRST
acceptCall()  // Audio connects immediately

// CLAIM IN BACKGROUND (non-blocking)
const claimResult = await claimCallMutation({ callSid })
if (!claimResult.success) {
  activeCall.disconnect()  // Only disconnect if claim fails
}
```

### 3. Fire-and-Forget Pattern

For non-critical operations (like database tracking), use fire-and-forget to avoid blocking the UI:

```typescript
// Fire and forget - don't await, don't disconnect on failure
fetch("/api/twilio/claim-call", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ twilioCallSid: callSid }),
})
  .then((response) => response.json())
  .then((result) => {
    if (!result.success) {
      console.warn(`Claim call result: ${result.reason} (call continues)`)
    }
  })
  .catch((error) => {
    console.error("Error claiming call (call continues):", error)
  })
```

### 4. Don't Disconnect on Claim Failure

Twilio handles the actual call routing. If claim fails, just log it - the audio is already connected.

### 5. Use Refs for Event Handler Closures

Event handlers capture state at creation time. Use refs to access current values:

```typescript
const incomingCallContactRef = useRef<ContactInfo | null>(null)

// Update ref when state changes
useEffect(() => {
  incomingCallContactRef.current = incomingCallContact
}, [incomingCallContact])

// In event handler, use ref
call.on('accept', () => {
  const currentContact = incomingCallContactRef.current  // Always current
  setActiveCallContact(currentContact)
})
```

### 6. Cleanup on Disconnect

Always clean up database state when calls disconnect:

```typescript
call.on('disconnect', async () => {
  // Clean up the call in database
  const callSid = call.parameters.CallSid
  if (callSid) {
    fetch("/api/twilio/end-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twilioCallSid: callSid }),
    })
  }
})
```

### 7. Context Provider for Device Persistence

Wrap the Twilio Device in a Context Provider at the app level so it persists across page navigation and calls don't disconnect when changing pages.

### 8. Pre-warm Microphone Permissions

Request microphone access on first user interaction (click/keydown) to make call acceptance faster.

### 9. Timeout Stale UI

Set timeouts to clear stale incoming call UI after ~45 seconds:

```typescript
const timeoutId = setTimeout(() => {
  console.log('Incoming call timeout - clearing stale UI after 45 seconds')
  setIncomingCallMap({})
}, 45000)

return () => clearTimeout(timeoutId)
```

### 10. Voice Webhook Direction Detection

Detect outbound vs inbound by checking if `from` starts with `client:`:

```typescript
const isOutboundFromBrowser = from && from.startsWith("client:")
if (isOutboundFromBrowser) {
  // Outbound call - dial PSTN
} else {
  // Inbound call - dial to browser clients
}
```

---

## Summary

The incoming call system follows this architecture:

1. **Token Generation**: Convex action generates Twilio Access Token with `incomingAllow: true`
2. **Device Context**: Provider wraps app, initializes Device once, handles all events
3. **Incoming Event**: Device fires `incoming`, UI shows immediately, ringtone plays
4. **Answer Flow**: Accept immediately, claim in background, transfer contact info
5. **Multi-Agent**: Map calls to all available agents, use claims for race conditions
6. **Cleanup**: Stop ringtone, clear database, update state on disconnect
7. **Single Source of Truth**: Twilio SDK state, not database queries, drives UI
