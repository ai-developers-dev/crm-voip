import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Platform Users (SaaS Owner Level)
  // These are users who manage the entire SaaS platform
  platformUsers: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    role: v.union(
      v.literal("super_admin"),    // Full platform access, can manage everything
      v.literal("platform_staff")  // Limited admin, can view and support tenants
    ),
    permissions: v.optional(v.array(v.string())), // Granular permissions
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"]),

  // Organizations (Tenants)
  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    // isPlatformOrg: true means this is the SaaS owner's organization
    // Only one organization should have this set to true
    isPlatformOrg: v.optional(v.boolean()),
    plan: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise")
    ),
    // Business information
    businessInfo: v.optional(v.object({
      streetAddress: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      phone: v.string(),
      ownerName: v.string(),
      ownerEmail: v.string(),
    })),
    // Billing/pricing information
    billing: v.optional(v.object({
      basePlanPrice: v.number(),      // Monthly base price (e.g., 97)
      perUserPrice: v.number(),       // Price per user (e.g., 47)
      includedUsers: v.number(),      // Users included in base plan (e.g., 1)
      billingEmail: v.optional(v.string()),
      stripeCustomerId: v.optional(v.string()),
      stripeSubscriptionId: v.optional(v.string()),
      subscriptionStatus: v.optional(v.union(
        v.literal("active"),
        v.literal("past_due"),
        v.literal("canceled"),
        v.literal("trialing"),
        v.literal("unpaid")
      )),
      currentPeriodEnd: v.optional(v.number()),
      trialEndsAt: v.optional(v.number()),
    })),
    // Onboarding tracking for tenant owners
    onboarding: v.optional(v.object({
      completedAt: v.optional(v.number()),    // Timestamp when fully completed
      skippedAt: v.optional(v.number()),      // Timestamp if skipped
      currentStep: v.optional(v.number()),    // For resuming (0-4)
    })),
    settings: v.object({
      recordingEnabled: v.boolean(),
      holdMusicUrl: v.optional(v.string()),
      holdMusicStorageId: v.optional(v.id("_storage")), // Convex storage ID for uploaded MP3
      maxConcurrentCalls: v.number(),
      // Per-tenant Twilio credentials
      twilioCredentials: v.optional(v.object({
        accountSid: v.string(),
        authToken: v.string(),
        apiKey: v.optional(v.string()),
        apiSecret: v.optional(v.string()),
        twimlAppSid: v.optional(v.string()),
        isConfigured: v.boolean(),
      })),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_org_id", ["clerkOrgId"])
    .index("by_slug", ["slug"])
    .index("by_is_platform", ["isPlatformOrg"]),

  // Users/Agents (Tenant Level)
  // These are users within a specific tenant organization
  users: defineTable({
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    role: v.union(
      v.literal("tenant_admin"),  // Can manage their organization
      v.literal("supervisor"),    // Can manage agents, view reports
      v.literal("agent")          // Regular call agent
    ),
    extension: v.optional(v.string()),
    directNumber: v.optional(v.string()),
    status: v.union(
      v.literal("available"),
      v.literal("busy"),
      v.literal("on_call"),
      v.literal("on_break"),
      v.literal("offline")
    ),
    // Daily call counts (stored directly on user for simplicity)
    todayInboundCalls: v.optional(v.number()),
    todayOutboundCalls: v.optional(v.number()),
    lastCallCountReset: v.optional(v.string()), // "YYYY-MM-DD" for daily reset
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_extension", ["organizationId", "extension"]),

  // Phone Numbers
  phoneNumbers: defineTable({
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
    twilioSid: v.string(),
    friendlyName: v.string(),
    type: v.union(
      v.literal("main"),
      v.literal("department"),
      v.literal("direct"),
      v.literal("tracking")
    ),
    assignedUserId: v.optional(v.id("users")),
    routingType: v.union(
      v.literal("ring_all"),
      v.literal("round_robin"),
      v.literal("least_recent"),
      v.literal("direct")
    ),
    voicemailEnabled: v.boolean(),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_phone_number", ["phoneNumber"])
    .index("by_assigned_user", ["assignedUserId"]),

  // Active Calls (Real-time state)
  activeCalls: defineTable({
    organizationId: v.id("organizations"),
    twilioCallSid: v.string(),
    conferenceSid: v.optional(v.string()),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),

    // Caller information
    from: v.string(),
    fromName: v.optional(v.string()),
    to: v.string(),
    toName: v.optional(v.string()),

    // State machine
    state: v.union(
      v.literal("ringing"),
      v.literal("connecting"),
      v.literal("connected"),
      v.literal("on_hold"),
      v.literal("parked"),
      v.literal("transferring"),
      v.literal("ended")
    ),

    // Assignment
    assignedUserId: v.optional(v.id("users")),
    previousUserId: v.optional(v.id("users")),
    parkingSlot: v.optional(v.number()),

    // Timing
    startedAt: v.number(),
    answeredAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    holdStartedAt: v.optional(v.number()),

    // Recording
    isRecording: v.boolean(),
    recordingSid: v.optional(v.string()),

    // Metadata
    notes: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_state", ["organizationId", "state"])
    .index("by_twilio_sid", ["twilioCallSid"])
    .index("by_conference_sid", ["conferenceSid"])
    .index("by_assigned_user", ["assignedUserId"])
    .index("by_parking_slot", ["organizationId", "parkingSlot"])
    // New index for caller ID lookup
    .index("by_organization_from", ["organizationId", "from"]),

  // Call History (Historical records)
  callHistory: defineTable({
    organizationId: v.id("organizations"),
    twilioCallSid: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),

    from: v.string(),
    fromName: v.optional(v.string()),
    to: v.string(),
    toName: v.optional(v.string()),

    // Final outcome
    outcome: v.union(
      v.literal("answered"),
      v.literal("voicemail"),
      v.literal("missed"),
      v.literal("busy"),
      v.literal("failed"),
      v.literal("cancelled")
    ),

    // Users involved
    handledByUserId: v.optional(v.id("users")),
    transferredFromUserId: v.optional(v.id("users")),

    // Timing
    startedAt: v.number(),
    answeredAt: v.optional(v.number()),
    endedAt: v.number(),
    duration: v.number(),
    talkTime: v.optional(v.number()),
    holdTime: v.optional(v.number()),

    // Recording
    recordingUrl: v.optional(v.string()),
    recordingDuration: v.optional(v.number()),

    // Notes
    notes: v.optional(v.string()),
    disposition: v.optional(v.string()),

    // Contact linking
    contactId: v.optional(v.id("contacts")),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_date", ["organizationId", "startedAt"])
    .index("by_user", ["handledByUserId"])
    .index("by_user_date", ["handledByUserId", "startedAt"])
    .index("by_contact", ["contactId"])
    .index("by_twilio_sid", ["twilioCallSid"])
    // New indexes for phone number lookups and reporting
    .index("by_organization_from", ["organizationId", "from"])
    .index("by_organization_to", ["organizationId", "to"])
    .index("by_org_outcome_date", ["organizationId", "outcome", "startedAt"]),

  // Parking Lots (Call parking slots)
  parkingLots: defineTable({
    organizationId: v.id("organizations"),
    slotNumber: v.number(),
    isOccupied: v.boolean(),
    activeCallId: v.optional(v.id("activeCalls")),
    parkedByUserId: v.optional(v.id("users")),
    parkedAt: v.optional(v.number()),
    holdMusicUrl: v.optional(v.string()),
    conferenceName: v.optional(v.string()), // Twilio conference name for parking
    pstnCallSid: v.optional(v.string()), // The PSTN caller's call SID (needed for unparking)
    callerNumber: v.optional(v.string()),
    callerName: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_slot", ["organizationId", "slotNumber"]),

  // Targeted Ringing (for unpark/transfer to specific user)
  // When a call is being directed to a specific user, not broadcast to all
  targetedRinging: defineTable({
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
    callerNumber: v.string(),
    callerName: v.optional(v.string()),
    pstnCallSid: v.string(),
    status: v.union(
      v.literal("ringing"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("expired")
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_target_user", ["targetUserId", "status"])
    .index("by_organization", ["organizationId"])
    .index("by_pstn_sid", ["pstnCallSid"]),

  // Pending Transfers (for transfer workflow with ringing)
  pendingTransfers: defineTable({
    organizationId: v.id("organizations"),
    activeCallId: v.id("activeCalls"),
    twilioCallSid: v.string(),
    sourceUserId: v.optional(v.id("users")), // Who initiated the transfer (null if from parking)
    targetUserId: v.id("users"), // Who needs to answer
    targetTwilioCallSid: v.optional(v.string()), // SID of the outbound call to target
    status: v.union(
      v.literal("ringing"),   // Target agent's phone is ringing
      v.literal("accepted"),  // Target answered
      v.literal("declined"),  // Target rejected
      v.literal("timeout")    // No answer within timeout
    ),
    type: v.union(
      v.literal("direct"),    // Direct transfer from agent to agent
      v.literal("from_park")  // Transfer from parking slot
    ),
    returnToParkSlot: v.optional(v.number()), // If declined and from_park, return here
    createdAt: v.number(),
    expiresAt: v.number(), // When the ringing times out
  })
    .index("by_target_user_status", ["targetUserId", "status"])
    .index("by_call", ["activeCallId"])
    .index("by_organization", ["organizationId"])
    .index("by_twilio_sid", ["twilioCallSid"]),

  // Real-time Presence
  presence: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    status: v.union(
      v.literal("available"),
      v.literal("busy"),
      v.literal("on_call"),
      v.literal("on_break"),
      v.literal("offline")
    ),
    statusMessage: v.optional(v.string()),
    lastHeartbeat: v.number(),
    currentCallId: v.optional(v.id("activeCalls")),
    deviceInfo: v.optional(
      v.object({
        browser: v.string(),
        os: v.string(),
      })
    ),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_organization_status", ["organizationId", "status"]),

  // Contacts (CRM)
  contacts: defineTable({
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    // Address fields
    streetAddress: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    phoneNumbers: v.array(
      v.object({
        number: v.string(),
        type: v.union(v.literal("mobile"), v.literal("work"), v.literal("home")),
        isPrimary: v.boolean(),
      })
    ),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    assignedUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_assigned_user", ["assignedUserId"])
    .index("by_organization_name", ["organizationId", "firstName"])
    .index("by_organization_email", ["organizationId", "email"]),

  // ============================================
  // SMS/MESSAGING TABLES
  // ============================================

  // SMS Messages
  messages: defineTable({
    organizationId: v.id("organizations"),
    twilioMessageSid: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    from: v.string(),
    to: v.string(),
    body: v.string(),
    mediaUrls: v.optional(v.array(v.string())), // MMS attachments
    status: v.union(
      v.literal("queued"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("undelivered")
    ),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    assignedUserId: v.optional(v.id("users")),
    contactId: v.optional(v.id("contacts")),
    conversationId: v.optional(v.id("conversations")),
    segmentCount: v.number(), // For billing (SMS > 160 chars)
    price: v.optional(v.number()),
    sentAt: v.number(),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_date", ["organizationId", "sentAt"])
    .index("by_conversation", ["conversationId"])
    .index("by_contact", ["contactId"])
    .index("by_twilio_sid", ["twilioMessageSid"])
    .index("by_assigned_user", ["assignedUserId"]),

  // SMS Conversations (threads)
  conversations: defineTable({
    organizationId: v.id("organizations"),
    customerPhoneNumber: v.string(),
    businessPhoneNumber: v.string(), // Your Twilio number
    contactId: v.optional(v.id("contacts")),
    contactName: v.optional(v.string()), // Cached contact name for display
    assignedUserId: v.optional(v.id("users")),
    status: v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("spam")
    ),
    lastMessageAt: v.number(),
    lastMessagePreview: v.string(),
    unreadCount: v.number(), // For agent dashboard
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_assigned_user", ["assignedUserId"])
    .index("by_phone_numbers", ["organizationId", "customerPhoneNumber", "businessPhoneNumber"])
    .index("by_contact", ["contactId"])
    .index("by_last_message", ["organizationId", "lastMessageAt"]),

  // ============================================
  // CRM ACTIVITY TABLES
  // ============================================

  // Activities (CRM timeline events)
  activities: defineTable({
    organizationId: v.id("organizations"),
    type: v.union(
      v.literal("call"),
      v.literal("sms"),
      v.literal("email"),
      v.literal("note"),
      v.literal("meeting"),
      v.literal("task_created"),
      v.literal("task_completed"),
      v.literal("status_changed")
    ),
    contactId: v.optional(v.id("contacts")),
    callId: v.optional(v.id("callHistory")),
    messageId: v.optional(v.id("messages")),
    title: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()), // Flexible JSON for type-specific data
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_date", ["organizationId", "createdAt"])
    .index("by_contact", ["contactId", "createdAt"])
    .index("by_type", ["organizationId", "type"])
    .index("by_user", ["createdByUserId"]),

  // Tasks (follow-ups, reminders)
  tasks: defineTable({
    organizationId: v.id("organizations"),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("call_back"),
      v.literal("send_email"),
      v.literal("follow_up"),
      v.literal("meeting"),
      v.literal("other")
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    ),
    assignedToUserId: v.id("users"),
    createdByUserId: v.id("users"),
    contactId: v.optional(v.id("contacts")),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    dueDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_assigned_user", ["assignedToUserId", "status"])
    .index("by_due_date", ["organizationId", "dueDate"])
    .index("by_contact", ["contactId"])
    .index("by_status", ["organizationId", "status"]),

  // ============================================
  // USAGE & BILLING TABLES
  // ============================================

  // Daily Usage Metrics (for billing and analytics)
  dailyUsage: defineTable({
    organizationId: v.id("organizations"),
    date: v.string(), // "YYYY-MM-DD"
    // Call metrics
    totalCalls: v.number(),
    inboundCalls: v.number(),
    outboundCalls: v.number(),
    missedCalls: v.number(),
    totalCallMinutes: v.number(),
    // SMS metrics
    totalSms: v.number(),
    inboundSms: v.number(),
    outboundSms: v.number(),
    // User metrics
    activeUsers: v.number(),
    peakConcurrentCalls: v.number(),
    // Costs (for billing)
    estimatedCost: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_date", ["organizationId", "date"])
    .index("by_date", ["date"]),

  // User Daily Metrics (per-agent dashboard display)
  userDailyMetrics: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    date: v.string(), // "YYYY-MM-DD"
    callsAccepted: v.number(),
    talkTimeSeconds: v.number(),
    inboundCallsAccepted: v.optional(v.number()), // Inbound calls answered today
    outboundCallsMade: v.optional(v.number()), // Outbound calls made today
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_organization_date", ["organizationId", "date"]),

  // ============================================
  // AUDIT & COMPLIANCE TABLES
  // ============================================

  // Audit Log (for security & compliance)
  auditLog: defineTable({
    organizationId: v.optional(v.id("organizations")), // Optional for platform actions
    userId: v.optional(v.string()), // Clerk ID (user or platform admin)
    userEmail: v.string(),
    userRole: v.optional(v.string()),
    action: v.string(), // e.g., "user.created", "call.transferred", "settings.updated"
    entityType: v.optional(v.string()), // e.g., "user", "call", "organization"
    entityId: v.optional(v.string()),
    changes: v.optional(v.any()), // Before/after values
    metadata: v.optional(v.any()), // Additional context
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_organization", ["organizationId", "timestamp"])
    .index("by_user", ["userId", "timestamp"])
    .index("by_action", ["action", "timestamp"])
    .index("by_entity", ["entityType", "entityId"]),
});
