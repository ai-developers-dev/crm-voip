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

  // ============================================
  // AGENCY TYPE TABLES (Platform-level)
  // ============================================

  // Agency Types - Platform-level business categories
  agencyTypes: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    monthlyBasePrice: v.optional(v.number()),
    perUserPrice: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["isActive"])
    .index("by_name", ["name"]),

  // Agency Carriers - Companies/carriers per agency type
  agencyCarriers: defineTable({
    agencyTypeId: v.id("agencyTypes"),
    name: v.string(),
    description: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    portalUrl: v.optional(v.string()), // Agent portal login/dashboard URL
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agency_type", ["agencyTypeId"])
    .index("by_agency_type_active", ["agencyTypeId", "isActive"]),

  // Agency Products / Lines of Business - per carrier
  agencyProducts: defineTable({
    agencyTypeId: v.id("agencyTypes"),
    carrierId: v.id("agencyCarriers"),
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    coverageFields: v.optional(v.array(v.object({
      key: v.string(),
      label: v.string(),
      placeholder: v.optional(v.string()),
      type: v.optional(v.union(
        v.literal("text"),
        v.literal("currency"),
        v.literal("number"),
        v.literal("select"),
      )),
      options: v.optional(v.array(v.string())),
      apiFieldName: v.optional(v.string()),
    }))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agency_type", ["agencyTypeId"])
    .index("by_agency_type_active", ["agencyTypeId", "isActive"])
    .index("by_carrier", ["carrierId"]),

  // Portal Field Mappings - captured selectors per carrier/quoteType for automation
  portalFieldMappings: defineTable({
    carrierId: v.id("agencyCarriers"),
    quoteType: v.string(), // "auto", "home", "package", etc.
    screens: v.array(v.object({
      name: v.string(),
      order: v.number(),
      url: v.optional(v.string()),
      pageSource: v.optional(v.string()), // DEPRECATED: kept for backward compat, new sources go to portalPageSources table
      // Automation metadata
      action: v.optional(v.string()),
      nextButton: v.optional(v.string()),
      sidebarLink: v.optional(v.string()),
      waitAfterNext: v.optional(v.number()),
      progressStage: v.optional(v.string()),
      fields: v.array(v.object({
        selector: v.string(),
        tag: v.string(),
        type: v.string(),
        label: v.optional(v.string()),
        id: v.optional(v.string()),
        name: v.optional(v.string()),
        contactField: v.optional(v.string()),
        defaultValue: v.optional(v.string()),
        selectedValue: v.optional(v.string()),
        transform: v.optional(v.string()), // "formatDob", "uppercase", "phoneDigitsOnly"
        required: v.optional(v.boolean()),
        options: v.optional(v.array(v.object({
          value: v.string(),
          text: v.string(),
        }))),
      })),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_carrier", ["carrierId"])
    .index("by_carrier_quote_type", ["carrierId", "quoteType"]),

  // Portal Page Sources - cleaned HTML per screen (stored separately to avoid 1MB doc limit)
  portalPageSources: defineTable({
    mappingId: v.id("portalFieldMappings"),
    screenName: v.string(),
    screenOrder: v.number(),
    pageSource: v.string(), // cleaned HTML (up to 200KB)
    url: v.optional(v.string()),
    capturedAt: v.number(),
  })
    .index("by_mapping", ["mappingId"])
    .index("by_mapping_screen", ["mappingId", "screenName"]),

  // Portal Sessions - persisted browser cookies for 2FA "remember device"
  portalSessions: defineTable({
    carrierKey: v.string(),         // "natgen"
    credentialHash: v.string(),     // SHA-256 of username (first 12 chars)
    storageState: v.string(),       // JSON blob of cookies + localStorage
    updatedAt: v.number(),
  }).index("by_carrier_cred", ["carrierKey", "credentialHash"]),

  // Carrier Commissions - Commission rates per carrier x product
  carrierCommissions: defineTable({
    agencyTypeId: v.id("agencyTypes"),
    carrierId: v.id("agencyCarriers"),
    productId: v.id("agencyProducts"),
    commissionRate: v.number(),
    renewalRate: v.number(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agency_type", ["agencyTypeId"])
    .index("by_carrier", ["carrierId"])
    .index("by_product", ["productId"])
    .index("by_carrier_product", ["carrierId", "productId"]),

  // Tenant's selected carriers (subset of agencyCarriers they work with)
  tenantCarriers: defineTable({
    organizationId: v.id("organizations"),
    agencyTypeId: v.id("agencyTypes"),
    carrierId: v.id("agencyCarriers"),
    // Portal login credentials (encrypted)
    portalUrl: v.optional(v.string()),
    portalUsername: v.optional(v.string()),
    portalPassword: v.optional(v.string()),
    portalConfigured: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_carrier", ["organizationId", "carrierId"]),

  // Tenant's selected products/lines of business
  tenantProducts: defineTable({
    organizationId: v.id("organizations"),
    agencyTypeId: v.id("agencyTypes"),
    productId: v.id("agencyProducts"),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_product", ["organizationId", "productId"]),

  // Tenant-specific commission rates
  tenantCommissions: defineTable({
    organizationId: v.id("organizations"),
    agencyTypeId: v.id("agencyTypes"),
    carrierId: v.id("agencyCarriers"),
    productId: v.id("agencyProducts"),
    commissionRate: v.number(),
    renewalRate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_carrier", ["organizationId", "carrierId"])
    .index("by_carrier_product", ["organizationId", "carrierId", "productId"]),

  // Organizations (Tenants)
  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    agencyTypeId: v.optional(v.id("agencyTypes")),
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
      enabledAddons: v.optional(v.array(v.string())),  // Feature keys enabled for this tenant
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
      logoStorageId: v.optional(v.id("_storage")), // Convex storage ID for agency logo
      logoUrl: v.optional(v.string()),
      maxConcurrentCalls: v.number(),
      // Master Twilio account (platform org only)
      twilioMaster: v.optional(v.object({
        accountSid: v.string(),
        authToken: v.string(),  // encrypted
        isConfigured: v.boolean(),
      })),
      // Per-tenant Twilio credentials (subaccount or self-managed)
      twilioCredentials: v.optional(v.object({
        accountSid: v.string(),
        authToken: v.string(),
        apiKey: v.optional(v.string()),
        apiSecret: v.optional(v.string()),
        twimlAppSid: v.optional(v.string()),
        isConfigured: v.boolean(),
        isAutoProvisioned: v.optional(v.boolean()), // true = platform-managed subaccount
      })),
      // National General portal credentials (encrypted)
      natgenCredentials: v.optional(v.object({
        username: v.string(),
        password: v.string(),
        portalUrl: v.optional(v.string()),
        isConfigured: v.boolean(),
      })),
      // Retell AI calling credentials
      retellApiKey: v.optional(v.string()),  // Encrypted
      retellConfigured: v.optional(v.boolean()),
      // A2P 10DLC compliance
      a2pMessagingServiceSid: v.optional(v.string()),
      a2pStatus: v.optional(v.string()),
      // Stripe billing (platform org only)
      stripeConfig: v.optional(v.object({
        secretKey: v.string(),
        publishableKey: v.string(),
        webhookSecret: v.optional(v.string()),
        isConfigured: v.boolean(),
      })),
      // OpenAI (platform org only — for SMS AI agents)
      openaiApiKey: v.optional(v.string()),
      openaiConfigured: v.optional(v.boolean()),
      // Nylas email & calendar (platform org only)
      nylasConfig: v.optional(v.object({
        clientId: v.string(),
        apiKey: v.string(),
        webhookSecret: v.optional(v.string()),
        isConfigured: v.boolean(),
      })),
      // Cost markups for billing (platform org only)
      twilioMarkupPercent: v.optional(v.number()),  // Default 50 = 50% on calls & SMS
      retellMarkupPercent: v.optional(v.number()),  // Default 50 = 50% on AI voice calling
      // Support ticket auto-reply
      supportAutoReply: v.optional(v.string()),       // Auto-reply message on new ticket
      supportNoAgentMessage: v.optional(v.string()),  // Message if no response within delay
      supportAutoReplyDelaySec: v.optional(v.number()), // Seconds before no-agent message
      openaiMarkupPercent: v.optional(v.number()),  // Default 50 = 50% on AI SMS agents
      // Deprecated: goals now in salesGoals table. Kept for existing data.
      salesGoals: v.optional(v.object({
        dailyPremium: v.optional(v.number()),
        weeklyPremium: v.optional(v.number()),
        monthlyPremium: v.optional(v.number()),
        dailyPolicies: v.optional(v.number()),
        weeklyPolicies: v.optional(v.number()),
        monthlyPolicies: v.optional(v.number()),
      })),
    }),
    // Top-level for webhook lookup (denormalized from settings.twilioCredentials.accountSid)
    twilioAccountSid: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_org_id", ["clerkOrgId"])
    .index("by_slug", ["slug"])
    .index("by_is_platform", ["isPlatformOrg"])
    .index("by_agency_type", ["agencyTypeId"])
    .index("by_twilio_account_sid", ["twilioAccountSid"]),

  // Users/Agents (Tenant Level)
  // These are users within a specific tenant organization
  users: defineTable({
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")), // Convex storage ID for profile photo
    role: v.union(
      v.literal("tenant_admin"),  // Can manage their organization
      v.literal("supervisor"),    // Can manage agents, view reports
      v.literal("agent")          // Regular call agent
    ),
    extension: v.optional(v.string()),
    directNumber: v.optional(v.string()),
    agentCommissionSplit: v.optional(v.number()), // Percentage of agency commission the agent receives
    agentRenewalSplit: v.optional(v.number()), // Percentage of agency renewal commission the agent receives
    status: v.union(
      v.literal("available"),
      v.literal("busy"),
      v.literal("on_call"),
      v.literal("on_break"),
      v.literal("offline")
    ),
    // Deprecated: metrics now in userDailyMetrics table. Kept for existing data.
    todayInboundCalls: v.optional(v.number()),
    todayOutboundCalls: v.optional(v.number()),
    lastCallCountReset: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_extension", ["organizationId", "extension"]),

  // Phone Numbers
  // Blocked caller IDs. Twilio doesn't have a server-side block list
  // for inbound voice/SMS — the recommended pattern is to check this
  // table inside the voice/SMS webhook and respond with `<Reject
  // reason="busy"/>` (voice) or an empty TwiML (SMS) before any
  // billable work happens. `phoneNumber` is stored in E.164 form so
  // lookup is a single `by_org_phone` index hit.
  blockedNumbers: defineTable({
    organizationId: v.id("organizations"),
    phoneNumber: v.string(), // E.164, e.g. "+13145906820"
    blockedByUserId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_phone", ["organizationId", "phoneNumber"]),

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
      v.literal("direct"),
      v.literal("ring_group")
    ),
    ringGroupUserIds: v.optional(v.array(v.id("users"))),
    voicemailEnabled: v.boolean(),
    aiAgentId: v.optional(v.id("retellAgents")),
    // Unanswered call fallback
    unansweredAction: v.optional(v.union(
      v.literal("voicemail"),
      v.literal("parking"),
      v.literal("ai_agent")
    )),
    unansweredTimeoutSeconds: v.optional(v.number()),
    unansweredAiAgentId: v.optional(v.id("retellAgents")),
    voicemailGreeting: v.optional(v.string()), // If set, inbound calls route to AI agent
    monthlyCost: v.optional(v.number()),       // Monthly cost in cents
    purchasedAt: v.optional(v.number()),       // When purchased via platform
    capabilities: v.optional(v.object({
      voice: v.boolean(),
      sms: v.boolean(),
      mms: v.boolean(),
    })),
    isActive: v.boolean(),
    // Twilio IncomingPhoneNumber config — mirrored from Twilio after save.
    // Source of truth is Twilio; this copy is so the admin UI can show
    // current values without calling Twilio on every render.
    twilioConfig: v.optional(v.object({
      // Voice
      voiceUrl: v.optional(v.string()),
      voiceMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      voiceFallbackUrl: v.optional(v.string()),
      voiceFallbackMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      statusCallbackUrl: v.optional(v.string()),
      statusCallbackMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      voiceCallerIdLookup: v.optional(v.boolean()),
      voiceReceiveMode: v.optional(v.union(v.literal("voice"), v.literal("fax"))),
      // Messaging
      smsUrl: v.optional(v.string()),
      smsMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      smsFallbackUrl: v.optional(v.string()),
      smsFallbackMethod: v.optional(v.union(v.literal("POST"), v.literal("GET"))),
      // Metadata
      lastSyncedAt: v.optional(v.number()),
    })),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_phone_number", ["phoneNumber"])
    .index("by_assigned_user", ["assignedUserId"]),

  // Active Calls (Real-time state)
  activeCalls: defineTable({
    organizationId: v.id("organizations"),
    twilioCallSid: v.string(),
    // Agent-leg (child) CallSid — populated when the call is claimed by a
    // browser user. For inbound calls this is what the browser's Twilio
    // SDK reports via `call.parameters.CallSid`, while `twilioCallSid`
    // above is the PSTN (parent) leg from the voice webhook. Storing
    // both lets `endByCallSid` find the row regardless of which SID the
    // cleanup caller has. See commits 15568aa / 4ff15a8 for the dual-leg
    // history and why this field was needed.
    childCallSid: v.optional(v.string()),
    conferenceSid: v.optional(v.string()), // Deprecated: kept for existing data
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
    .index("by_child_call_sid", ["childCallSid"])
    .index("by_assigned_user", ["assignedUserId"]),

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

    // Transcription (from Twilio voicemail transcription)
    transcriptionText: v.optional(v.string()),
    transcriptionSid: v.optional(v.string()),

    // Notes
    notes: v.optional(v.string()),
    disposition: v.optional(v.string()),
    dispositionId: v.optional(v.id("callDispositions")),

    // Contact linking
    contactId: v.optional(v.id("contacts")),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_date", ["organizationId", "startedAt"])
    .index("by_user", ["handledByUserId"])
    .index("by_user_date", ["handledByUserId", "startedAt"])
    .index("by_contact", ["contactId"])
    .index("by_twilio_sid", ["twilioCallSid"])
    .index("by_org_outcome_date", ["organizationId", "outcome", "startedAt"])
    .index("by_org_needs_disposition", ["organizationId", "dispositionId"]),

  // Platform-defined call dispositions. Super-admin maintains the master list;
  // tenants opt in via tenantCallDispositions. Stored label is copied onto
  // callHistory.disposition for cheap reporting without joins.
  callDispositions: defineTable({
    label: v.string(),
    category: v.optional(
      v.union(
        v.literal("contacted"),
        v.literal("not_contacted"),
        v.literal("outcome"),
      ),
    ),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_active_sort", ["isActive", "sortOrder"]),

  // Tenant's enable/disable flags for the platform dispositions they want to
  // expose to their agents. Default (no row) = enabled, so a fresh tenant
  // sees every active platform disposition without explicit opt-in.
  tenantCallDispositions: defineTable({
    organizationId: v.id("organizations"),
    dispositionId: v.id("callDispositions"),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_disposition", ["organizationId", "dispositionId"]),

  // Voicemails (stored recordings with transcriptions)
  voicemails: defineTable({
    organizationId: v.id("organizations"),
    callHistoryId: v.optional(v.id("callHistory")),
    twilioCallSid: v.string(),
    recordingSid: v.string(),
    recordingUrl: v.string(),
    duration: v.number(),
    transcriptionText: v.optional(v.string()),
    callerNumber: v.string(),
    callerName: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_read", ["organizationId", "isRead"])
    .index("by_call_sid", ["twilioCallSid"]),

  // Parking Lots (Call parking slots)
  parkingLots: defineTable({
    organizationId: v.id("organizations"),
    slotNumber: v.number(),
    isOccupied: v.boolean(),
    activeCallId: v.optional(v.id("activeCalls")),
    parkedByUserId: v.optional(v.id("users")),
    parkedAt: v.optional(v.number()),
    holdMusicUrl: v.optional(v.string()), // Deprecated: org-level holdMusicUrl used instead
    conferenceName: v.optional(v.string()), // Twilio conference name for parking
    pstnCallSid: v.optional(v.string()), // The PSTN caller's call SID (needed for unparking)
    callerNumber: v.optional(v.string()),
    callerName: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_slot", ["organizationId", "slotNumber"])
    .index("by_conference_name", ["conferenceName"])
    // Used by /api/twilio/end-call to detect "is this PSTN leg
    // currently parked?" without depending on activeCalls.state
    // being correctly patched. Authoritative source: if a parking
    // slot exists with this SID, the call is parked, full stop.
    .index("by_pstn_call_sid", ["pstnCallSid"]),

  // Targeted Ringing (for unpark/transfer to specific user)
  // When a call is being directed to a specific user, not broadcast to all
  targetedRinging: defineTable({
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
    callerNumber: v.string(),
    callerName: v.optional(v.string()),
    pstnCallSid: v.string(),
    agentCallSid: v.optional(v.string()), // The callSid of the call to the agent's browser
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
    .index("by_pstn_sid", ["pstnCallSid"])
    .index("by_agent_sid", ["agentCallSid"]),

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
    // Cold = source agent drops as soon as the caller is moved into the
    // transfer conference (caller hears music until target answers).
    // Warm = source agent's leg is also moved into the conference, so
    // they remain on the call with the caller, can introduce, then drop
    // when ready. Optional for backward compat — old rows default to "cold".
    mode: v.optional(v.union(v.literal("cold"), v.literal("warm"))),
    // Twilio conference name we created for this transfer. Both legs
    // (caller, target, optionally source) join this conference.
    conferenceName: v.optional(v.string()),
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

  // Contact Tags
  contactTags: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
    isActive: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"]),

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
    dateOfBirth: v.optional(v.string()), // "YYYY-MM-DD"
    gender: v.optional(v.string()),
    maritalStatus: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.id("contactTags"))),
    assignedUserId: v.optional(v.id("users")),
    isRead: v.optional(v.boolean()),
    // Prior Insurance (for quoting)
    priorInsuranceCarrier: v.optional(v.string()),     // e.g. "State Farm", "Progressive"
    priorBiCoverage: v.optional(v.string()),           // e.g. "100/300", "25/50"
    priorInsuranceExpDate: v.optional(v.string()),     // MM/DD/YYYY
    monthsWithRecentCarrier: v.optional(v.number()),   // e.g. 36

    // Household Drivers (captured from quoting portals)
    drivers: v.optional(v.array(v.object({
      firstName: v.string(),
      lastName: v.string(),
      dateOfBirth: v.optional(v.string()),            // MM/DD/YYYY
      relationship: v.optional(v.string()),           // e.g. "Insured", "Spouse", "Child"
      licenseNumber: v.optional(v.string()),
      licenseState: v.optional(v.string()),
    }))),

    // Vehicles (captured from quoting portals)
    vehicles: v.optional(v.array(v.object({
      year: v.string(),
      make: v.string(),
      model: v.string(),
      vin: v.optional(v.string()),
    }))),

    // DND (Do Not Contact)
    smsOptedOut: v.optional(v.boolean()),
    smsOptOutDate: v.optional(v.number()),
    smsOptInDate: v.optional(v.number()),
    emailOptedOut: v.optional(v.boolean()),
    emailOptOutDate: v.optional(v.number()),
    voiceOptedOut: v.optional(v.boolean()),
    voiceOptOutDate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_assigned_user", ["assignedUserId"])
    .index("by_organization_name", ["organizationId", "firstName"])
    .index("by_organization_email", ["organizationId", "email"]),

  // Phone number → contact lookup (denormalized for O(1) phone lookups)
  contactPhoneLookup: defineTable({
    normalizedPhone: v.string(), // Last 10 digits, digits only
    contactId: v.id("contacts"),
    organizationId: v.id("organizations"),
  })
    .index("by_org_phone", ["organizationId", "normalizedPhone"])
    .index("by_contact", ["contactId"]),

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
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    isAiGenerated: v.optional(v.boolean()),
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
    .index("by_assigned_user", ["assignedUserId"])
    .index("by_phone_numbers", ["organizationId", "customerPhoneNumber", "businessPhoneNumber"])
    .index("by_contact", ["contactId"])
    .index("by_organization_last_message", ["organizationId", "lastMessageAt"]),

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
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  })
    .index("by_organization", ["organizationId"])
    .index("by_assigned_user", ["assignedToUserId", "status"])
    .index("by_due_date", ["organizationId", "dueDate"])
    .index("by_contact", ["contactId"])
    .index("by_status", ["organizationId", "status"]),

  // Notes (contact-linked notes)
  notes: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    content: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  })
    .index("by_contact", ["contactId", "createdAt"])
    .index("by_organization", ["organizationId"]),

  // Appointments (scheduled meetings/calls)
  appointments: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.optional(v.id("contacts")),
    title: v.string(),
    description: v.optional(v.string()),
    appointmentDate: v.number(),
    endDate: v.optional(v.number()),
    location: v.optional(v.string()),
    type: v.union(
      v.literal("meeting"),
      v.literal("call"),
      v.literal("video"),
      v.literal("other")
    ),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("no_show")
    ),
    assignedToUserId: v.optional(v.id("users")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId", "appointmentDate"])
    .index("by_organization", ["organizationId"])
    .index("by_date", ["organizationId", "appointmentDate"])
    .index("by_assigned_user", ["assignedToUserId"]),

  // Policies (insurance policies linked to contacts)
  policies: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    policyNumber: v.string(),
    carrier: v.string(),
    type: v.union(
      v.literal("home"),
      v.literal("auto"),
      v.literal("life"),
      v.literal("health"),
      v.literal("umbrella"),
      v.literal("commercial"),
      v.literal("other")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
    premiumAmount: v.optional(v.number()),
    premiumFrequency: v.optional(
      v.union(
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("semi_annual"),
        v.literal("annual")
      )
    ),
    effectiveDate: v.optional(v.number()),
    expirationDate: v.optional(v.number()),
    description: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId"])
    .index("by_organization", ["organizationId"])
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

  // Documents (linked to contacts)
  documents: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.string(), // "contract", "id", "application", "claim", "correspondence", "other"
    fileName: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    status: v.string(), // "draft", "final", "archived"
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId"])
    .index("by_organization", ["organizationId"])
    .index("by_type", ["organizationId", "type"]),

  // ============================================
  // E-SIGNATURE TABLES
  // ============================================

  signatureRequests: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    documentId: v.optional(v.id("documents")),

    // PDF storage
    originalPdfStorageId: v.id("_storage"),
    signedPdfStorageId: v.optional(v.id("_storage")),
    fileName: v.string(),

    // Signing fields placed by agent
    fields: v.array(v.object({
      id: v.string(),
      type: v.union(v.literal("signature"), v.literal("initials"), v.literal("date"), v.literal("text")),
      page: v.number(),
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
      label: v.optional(v.string()),
      required: v.boolean(),
    })),

    // Status
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("viewed"),
      v.literal("signed"),
      v.literal("declined"),
      v.literal("expired"),
      v.literal("voided")
    ),

    // Signing token for unauthenticated access
    signingToken: v.string(),

    // Tracking
    subject: v.optional(v.string()),
    message: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    viewedAt: v.optional(v.number()),
    signedAt: v.optional(v.number()),
    signerName: v.optional(v.string()),
    signerIp: v.optional(v.string()),
    expiresAt: v.optional(v.number()),

    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_contact", ["contactId"])
    .index("by_token", ["signingToken"])
    .index("by_status", ["organizationId", "status"]),

  // ============================================
  // SALES TABLES
  // ============================================

  // Sale Types (tenant-configurable: New Business, Rewrite, Agent of Record, etc.)
  saleTypes: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    isActive: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"]),

  // Sales (linked to contacts, one carrier per sale, multiple line items)
  sales: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    userId: v.id("users"), // agent who entered the sale
    carrierId: v.id("agencyCarriers"),
    saleTypeId: v.optional(v.id("saleTypes")),
    policyNumber: v.optional(v.string()),
    effectiveDate: v.number(), // timestamp
    endDate: v.number(), // auto-calculated from effectiveDate + term
    term: v.number(), // months (6, 12, 24, 36)
    totalPremium: v.number(), // sum of all line item premiums
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("pending")
    ),
    notes: v.optional(v.string()),
    // Coverage details - dynamic keys defined per LOB in agencyProducts.coverageFields
    coverages: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_contact", ["contactId"])
    .index("by_user", ["userId"])
    .index("by_carrier", ["carrierId"])
    .index("by_organization_user", ["organizationId", "userId"])
    .index("by_organization_date", ["organizationId", "effectiveDate"]),

  // Sale Line Items (each line of business + premium within a sale)
  saleLineItems: defineTable({
    saleId: v.id("sales"),
    organizationId: v.id("organizations"),
    productId: v.id("agencyProducts"), // line of business
    premium: v.number(),
    createdAt: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_organization", ["organizationId"])
    .index("by_product", ["productId"]),

  // ============================================
  // EMAIL TABLES
  // ============================================

  // Email Accounts (Nylas-connected email accounts per tenant)
  emailAccounts: defineTable({
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    email: v.string(),
    provider: v.string(), // "gmail", "outlook", "imap"
    nylasGrantId: v.string(),
    nylasAccountId: v.optional(v.string()),
    status: v.string(), // "active", "disconnected", "error"
    syncState: v.optional(v.string()), // "syncing", "synced", "error"
    lastSyncAt: v.optional(v.number()),
    connectedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_nylas_grant", ["nylasGrantId"])
    .index("by_email", ["organizationId", "email"]),

  // Emails (sent and received via Nylas)
  emails: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.optional(v.id("contacts")),
    emailAccountId: v.id("emailAccounts"),
    nylasMessageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    direction: v.string(), // "inbound" | "outbound"
    from: v.string(),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyPlain: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    snippet: v.optional(v.string()),
    hasAttachments: v.optional(v.boolean()),
    attachments: v.optional(v.array(v.object({
      fileName: v.string(),
      contentType: v.string(),
      size: v.number(),
      nylasFileId: v.optional(v.string()),
    }))),
    status: v.string(), // "draft", "sent", "delivered", "failed"
    sentAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_contact", ["contactId", "sentAt"])
    .index("by_organization", ["organizationId", "sentAt"])
    .index("by_thread", ["threadId"])
    .index("by_nylas_message", ["nylasMessageId"])
    .index("by_email_account", ["emailAccountId"]),

  // Calendar Events (synced from Nylas - Google/Outlook calendars)
  calendarEvents: defineTable({
    organizationId: v.id("organizations"),
    emailAccountId: v.id("emailAccounts"),
    nylasEventId: v.string(),
    nylasCalendarId: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    location: v.optional(v.string()),
    isAllDay: v.optional(v.boolean()),
    status: v.string(), // "confirmed", "tentative", "cancelled"
    busy: v.optional(v.boolean()),
    conferenceUrl: v.optional(v.string()),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      status: v.string(), // "yes", "no", "maybe", "noreply"
    }))),
    recurringEventId: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    userId: v.optional(v.id("users")),
    lastSyncedAt: v.number(),
  })
    .index("by_organization", ["organizationId", "startTime"])
    .index("by_user", ["userId", "startTime"])
    .index("by_nylas_event", ["nylasEventId"])
    .index("by_email_account", ["emailAccountId"])
    .index("by_contact", ["contactId", "startTime"]),

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

  // Sales Goals - Month-specific targets per organization
  salesGoals: defineTable({
    organizationId: v.id("organizations"),
    month: v.number(), // 0-11
    year: v.number(),
    dailyPremium: v.optional(v.number()),
    weeklyPremium: v.optional(v.number()),
    monthlyPremium: v.optional(v.number()),
    dailyPolicies: v.optional(v.number()),
    weeklyPolicies: v.optional(v.number()),
    monthlyPolicies: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_year_month", ["organizationId", "year", "month"]),

  // ============================================
  // WORKFLOW AUTOMATION TABLES
  // ============================================

  // Workflow definitions
  workflows: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),

    // Trigger — top-level triggerType for indexing
    triggerType: v.union(
      v.literal("contact_created"),
      v.literal("tag_added"),
      v.literal("missed_call"),
      v.literal("incoming_sms"),
      v.literal("appointment_reminder"),
      v.literal("task_overdue"),
      v.literal("ai_call_completed"),
      v.literal("ai_call_transferred"),
      v.literal("pipeline_stage_entered"),
      v.literal("manual")
    ),
    triggerConfig: v.optional(v.object({
      tagId: v.optional(v.id("contactTags")),
      reminderMinutes: v.optional(v.number()),
      overdueMinutes: v.optional(v.number()),
      pipelineId: v.optional(v.string()),
      stageId: v.optional(v.string()),
    })),

    // Ordered steps
    steps: v.array(v.object({
      id: v.string(),
      order: v.number(),
      type: v.union(
        v.literal("send_sms"),
        v.literal("send_email"),
        v.literal("create_task"),
        v.literal("add_tag"),
        v.literal("remove_tag"),
        v.literal("create_note"),
        v.literal("assign_contact"),
        v.literal("ai_outbound_call"),
        v.literal("move_pipeline_stage"),
        v.literal("wait"),
        v.literal("if_else"),
        v.literal("ai_sms_agent")
      ),
      config: v.object({
        messageTemplate: v.optional(v.string()),
        emailSubject: v.optional(v.string()),
        emailBodyTemplate: v.optional(v.string()),
        taskTitle: v.optional(v.string()),
        taskDescription: v.optional(v.string()),
        taskType: v.optional(v.string()),
        taskPriority: v.optional(v.string()),
        taskDueDays: v.optional(v.number()),
        tagId: v.optional(v.id("contactTags")),
        noteTemplate: v.optional(v.string()),
        assignToUserId: v.optional(v.id("users")),
        retellAgentId: v.optional(v.string()),
        smsAgentId: v.optional(v.string()),
        pipelineId: v.optional(v.string()),
        stageId: v.optional(v.string()),
        waitMinutes: v.optional(v.number()),
        // If/Else condition fields
        conditions: v.optional(v.array(v.object({
          id: v.string(),
          field: v.string(),
          fieldCategory: v.string(),
          operator: v.string(),
          value: v.optional(v.string()),
        }))),
        conditionLogic: v.optional(v.union(v.literal("and"), v.literal("or"))),
        yesBranch: v.optional(v.any()), // Legacy recursive step array
        noBranch: v.optional(v.any()),  // Legacy recursive step array
        branches: v.optional(v.any()), // Multi-branch format (new)
      }),
    })),

    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_trigger", ["organizationId", "triggerType"]),

  // Workflow execution instances
  workflowExecutions: defineTable({
    organizationId: v.id("organizations"),
    workflowId: v.id("workflows"),
    contactId: v.id("contacts"),

    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),

    currentStepIndex: v.number(),

    snapshotSteps: v.array(v.object({
      id: v.string(),
      order: v.number(),
      type: v.string(),
      config: v.any(),
    })),

    stepResults: v.array(v.object({
      stepId: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("skipped")
      ),
      executedAt: v.optional(v.number()),
      error: v.optional(v.string()),
      branchPath: v.optional(v.string()),    // e.g. "step123.yes"
      branchResult: v.optional(v.string()),  // "yes" or "no" — which branch was taken
    })),

    triggerData: v.optional(v.any()),
    nextStepScheduledId: v.optional(v.string()),
    executionPointer: v.optional(v.any()), // Stack-based pointer for branch execution

    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_workflow", ["workflowId"])
    .index("by_contact", ["contactId"])
    .index("by_status", ["organizationId", "status"]),

  // ── Insurance Leads ──────────────────────────────────────────────────
  insuranceLeads: defineTable({
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    dob: v.string(),
    gender: v.optional(v.string()),
    maritalStatus: v.optional(v.string()),
    street: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    quoteTypes: v.array(v.string()),
    vehicles: v.optional(v.array(v.object({
      year: v.number(),
      make: v.string(),
      model: v.string(),
      vin: v.optional(v.string()),
      primaryUse: v.optional(v.string()),
    }))),
    property: v.optional(v.object({
      yearBuilt: v.optional(v.number()),
      sqft: v.optional(v.number()),
      stories: v.optional(v.number()),
      constructionType: v.optional(v.string()),
      ownershipType: v.optional(v.string()),
      roofType: v.optional(v.string()),
      primaryHeatType: v.optional(v.string()),
      numberOfFamilies: v.optional(v.number()),
      occupancy: v.optional(v.string()),
      residenceClass: v.optional(v.string()),
      hasPool: v.optional(v.boolean()),
      hasTrampoline: v.optional(v.boolean()),
      burglarAlarm: v.optional(v.string()),
      fireAlarm: v.optional(v.string()),
      sprinklerSystem: v.optional(v.string()),
      numberOfFullBath: v.optional(v.number()),
      numberOfHalfBath: v.optional(v.number()),
      numberOfGarages: v.optional(v.number()),
      numberOfFireplaces: v.optional(v.number()),
    })),
    priorInsurance: v.optional(v.object({
      carrier: v.optional(v.string()),
      biCoverage: v.optional(v.string()),
      expirationDate: v.optional(v.string()),
      yearsContinuous: v.optional(v.number()),
    })),
    status: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_status", ["organizationId", "status"])
    .index("by_organizationId_email", ["organizationId", "email"])
    .index("by_organizationId_phone", ["organizationId", "phone"]),

  // ── Insurance Quotes ─────────────────────────────────────────────────
  insuranceQuotes: defineTable({
    organizationId: v.id("organizations"),
    insuranceLeadId: v.id("insuranceLeads"),
    portal: v.string(),
    type: v.string(),
    status: v.string(),
    carrier: v.optional(v.string()),
    quoteId: v.optional(v.string()),
    monthlyPremium: v.optional(v.number()),
    annualPremium: v.optional(v.number()),
    coverageDetails: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    quotedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_lead", ["insuranceLeadId"])
    .index("by_organizationId_status", ["organizationId", "status"]),

  // ── Agent Runs (progress tracking) ───────────────────────────────────
  agentRuns: defineTable({
    organizationId: v.id("organizations"),
    type: v.string(),
    status: v.string(),
    total: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    currentLeadName: v.optional(v.string()),
    currentStage: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"]),

  // ── Retell AI Calling Agents ────────────────────────────────────────
  retellAgents: defineTable({
    organizationId: v.id("organizations"),
    retellAgentId: v.string(),
    name: v.string(),
    type: v.string(), // "inbound" | "outbound" | "both"
    description: v.optional(v.string()),
    isActive: v.boolean(),
    // Voice
    voiceId: v.string(),
    voiceModel: v.optional(v.string()),
    voiceSpeed: v.optional(v.number()),
    voiceTemperature: v.optional(v.number()),
    language: v.optional(v.string()),
    // LLM
    retellLlmId: v.optional(v.string()),
    generalPrompt: v.string(),
    beginMessage: v.optional(v.string()),
    model: v.optional(v.string()),
    modelTemperature: v.optional(v.number()),
    // Conversation
    responsiveness: v.optional(v.number()),
    interruptionSensitivity: v.optional(v.number()),
    enableBackchannel: v.optional(v.boolean()),
    ambientSound: v.optional(v.string()),
    maxCallDurationMs: v.optional(v.number()),
    endCallAfterSilenceMs: v.optional(v.number()),
    // Voicemail (outbound)
    enableVoicemailDetection: v.optional(v.boolean()),
    voicemailMessage: v.optional(v.string()),
    // Analysis
    analysisSummaryPrompt: v.optional(v.string()),
    analysisSuccessPrompt: v.optional(v.string()),
    postCallAnalysisFields: v.optional(v.any()),
    // Transfer
    enableTransferToHuman: v.optional(v.boolean()),
    transferPhoneNumber: v.optional(v.string()),
    // Phone number
    assignedPhoneNumberId: v.optional(v.id("phoneNumbers")),
    webhookUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_retell_agent_id", ["retellAgentId"])
    .index("by_phone_number", ["assignedPhoneNumberId"]),

  // ── AI Call History ─────────────────────────────────────────────────
  aiCallHistory: defineTable({
    organizationId: v.id("organizations"),
    retellAgentId: v.string(),
    retellCallId: v.string(),
    direction: v.string(), // "inbound" | "outbound"
    status: v.string(),    // "registered" | "ongoing" | "ended" | "error"
    fromNumber: v.string(),
    toNumber: v.string(),
    contactId: v.optional(v.id("contacts")),
    // Timing
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    // Transcript & Recording
    transcript: v.optional(v.string()),
    transcriptObject: v.optional(v.any()),
    recordingUrl: v.optional(v.string()),
    // Analysis
    callSummary: v.optional(v.string()),
    userSentiment: v.optional(v.string()),
    callSuccessful: v.optional(v.boolean()),
    customAnalysis: v.optional(v.any()),
    // Outcome
    disconnectionReason: v.optional(v.string()),
    transferDestination: v.optional(v.string()),
    // Cost
    callCostCents: v.optional(v.number()),
    // Workflow
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_retell_call_id", ["retellCallId"])
    .index("by_contact", ["contactId"])
    .index("by_agent", ["retellAgentId"]),

  // ── A2P 10DLC Brand Registrations ───────────────────────────────────
  a2pBrands: defineTable({
    organizationId: v.id("organizations"),
    // Twilio IDs
    customerProfileSid: v.optional(v.string()),
    trustProductSid: v.optional(v.string()),
    brandRegistrationSid: v.optional(v.string()),
    // Brand info
    legalBusinessName: v.string(),
    ein: v.string(),
    businessType: v.string(),
    businessIndustry: v.string(),
    websiteUrl: v.optional(v.string()),
    businessAddress: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      country: v.optional(v.string()),
    }),
    contactFirstName: v.string(),
    contactLastName: v.string(),
    contactEmail: v.string(),
    contactPhone: v.string(),
    contactTitle: v.optional(v.string()),
    // Status
    status: v.string(), // "draft" | "pending" | "approved" | "failed"
    failureReason: v.optional(v.string()),
    vettingScore: v.optional(v.number()),
    vettingStatus: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"]),

  // ── A2P 10DLC Campaign Registrations ────────────────────────────────
  a2pCampaigns: defineTable({
    organizationId: v.id("organizations"),
    brandId: v.id("a2pBrands"),
    // Twilio IDs
    messagingServiceSid: v.optional(v.string()),
    campaignSid: v.optional(v.string()),
    // Campaign info
    useCase: v.string(), // "CUSTOMER_CARE" | "MIXED" | "MARKETING" | "LOW_VOLUME_MIXED"
    description: v.string(),
    sampleMessages: v.array(v.string()),
    messageFlow: v.string(),
    helpMessage: v.string(),
    optInMessage: v.string(),
    optOutMessage: v.string(),
    hasEmbeddedLinks: v.boolean(),
    hasEmbeddedPhone: v.boolean(),
    isAgeGated: v.optional(v.boolean()),
    phoneNumberIds: v.optional(v.array(v.id("phoneNumbers"))),
    // Status
    status: v.string(), // "draft" | "pending" | "approved" | "failed"
    failureReason: v.optional(v.string()),
    approvedThroughput: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_brand", ["brandId"]),

  // ── SMS Consent Audit Log ───────────────────────────────────────────
  smsConsent: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.optional(v.id("contacts")),
    phoneNumber: v.string(),
    action: v.string(),         // "opt_out" | "opt_in" | "first_message" | "error_21610"
    keyword: v.optional(v.string()),
    source: v.optional(v.string()), // "inbound_sms" | "status_callback" | "manual"
    timestamp: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_contact", ["contactId"])
    .index("by_phone", ["phoneNumber"]),

  // ── Pipelines ───────────────────────────────────────────────────────
  pipelines: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    isActive: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"]),

  // ── Pipeline Stages ─────────────────────────────────────────────────
  pipelineStages: defineTable({
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    order: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pipeline", ["pipelineId"])
    .index("by_organization", ["organizationId"]),

  // ── Pipeline Contact Assignments ────────────────────────────────────
  pipelineContacts: defineTable({
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
    stageId: v.id("pipelineStages"),
    contactId: v.id("contacts"),
    enteredStageAt: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_pipeline", ["pipelineId"])
    .index("by_stage", ["stageId"])
    .index("by_contact", ["contactId"])
    .index("by_pipeline_stage", ["pipelineId", "stageId"]),

  // ── SMS AI Agents ──────────────────────────────────────────────────
  smsAgents: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    systemPrompt: v.string(),
    objective: v.optional(v.string()),
    model: v.string(), // "gpt-4.1-mini", "gpt-4.1"
    temperature: v.optional(v.number()),
    maxTurns: v.optional(v.number()),
    enabledTools: v.optional(v.array(v.string())),
    beginMessage: v.optional(v.string()),
    handoffMessage: v.optional(v.string()),
    handoffPhoneNumber: v.optional(v.string()),
    handoffUserId: v.optional(v.id("users")),
    completionMessage: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"]),

  smsAgentConversations: defineTable({
    organizationId: v.id("organizations"),
    smsAgentId: v.id("smsAgents"),
    contactId: v.id("contacts"),
    conversationId: v.optional(v.id("conversations")),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("handed_off"),
      v.literal("expired")
    ),
    turnCount: v.number(),
    aiMessages: v.array(v.object({
      role: v.string(),
      content: v.string(),
      toolCalls: v.optional(v.any()),
      toolResult: v.optional(v.any()),
      timestamp: v.number(),
    })),
    objectiveAchieved: v.optional(v.boolean()),
    handoffReason: v.optional(v.string()),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    totalTokensUsed: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_contact", ["contactId"])
    .index("by_agent", ["smsAgentId"])
    .index("by_conversation", ["conversationId"])
    .index("by_status", ["organizationId", "status"]),

  // ── Pricing Plans & Add-Ons ────────────────────────────────────────
  // ── Usage Invoices ──────────────────────────────────────────────────
  usageInvoices: defineTable({
    organizationId: v.id("organizations"),
    month: v.number(),
    year: v.number(),
    // Twilio
    twilioCallMinutes: v.number(),
    twilioSmsSent: v.number(),
    twilioCostCents: v.number(),
    twilioMarkupPercent: v.number(),
    twilioChargedCents: v.number(),
    // Retell
    retellCallCount: v.number(),
    retellCallMinutes: v.number(),
    retellCostCents: v.number(),
    retellMarkupPercent: v.number(),
    retellChargedCents: v.number(),
    // OpenAI
    openaiConversations: v.number(),
    openaiTokensUsed: v.number(),
    openaiCostCents: v.number(),
    openaiMarkupPercent: v.number(),
    openaiChargedCents: v.number(),
    // Totals
    totalCostCents: v.number(),
    totalChargedCents: v.number(),
    profitCents: v.number(),
    // Stripe
    stripeInvoiceId: v.optional(v.string()),
    stripePaymentStatus: v.optional(v.string()),
    // Status
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("void")
    ),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_month", ["year", "month"])
    .index("by_status", ["status"]),

  // ── Pricing Plans & Add-Ons ────────────────────────────────────────
  pricingPlans: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    basePriceMonthly: v.number(),
    perUserPrice: v.number(),
    includedUsers: v.number(),
    trialDays: v.number(),
    isActive: v.boolean(),
    isDefault: v.optional(v.boolean()),
    stripeProductId: v.optional(v.string()),
    stripeBasePriceId: v.optional(v.string()),
    stripePerUserPriceId: v.optional(v.string()),
    maxUsers: v.optional(v.number()),
    maxContacts: v.optional(v.number()),
    maxDailyCallMinutes: v.optional(v.number()),
    maxWorkflows: v.optional(v.number()),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  pricingAddons: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    priceMonthly: v.number(),
    category: v.string(),
    icon: v.optional(v.string()),
    isActive: v.boolean(),
    isIncludedInBase: v.optional(v.boolean()),
    stripeProductId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    featureKey: v.string(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // ── Support Tickets ────────────────────────────────────────────────
  supportTickets: defineTable({
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    userName: v.string(),
    orgName: v.string(),
    subject: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("in_progress"), v.literal("resolved"), v.literal("closed")),
    priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent")),
    assignedToId: v.optional(v.string()),
    lastMessageAt: v.number(),
    lastMessagePreview: v.string(),
    unreadByTenant: v.number(),
    unreadByAdmin: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_status", ["status"])
    .index("by_last_message", ["lastMessageAt"]),

  supportMessages: defineTable({
    ticketId: v.id("supportTickets"),
    senderType: v.union(v.literal("tenant"), v.literal("admin")),
    senderName: v.string(),
    senderUserId: v.optional(v.string()),
    body: v.string(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_ticket", ["ticketId"]),
});
