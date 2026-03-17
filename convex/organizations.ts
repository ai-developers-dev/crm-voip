import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgAdmin, authorizeSuperAdmin } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

// Public query to get current user's organization
export const getCurrent = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();
  },
});

// Query to get the platform organization (SaaS owner's org)
export const getPlatformOrg = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_is_platform", (q) => q.eq("isPlatformOrg", true))
      .first();
  },
});

// Look up organization by Twilio Account SID (for webhook routing)
export const getByTwilioAccountSid = query({
  args: { accountSid: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_twilio_account_sid", (q) => q.eq("twilioAccountSid", args.accountSid))
      .first();
  },
});

// Update master Twilio credentials (platform org only)
export const updateTwilioMaster = mutation({
  args: {
    organizationId: v.id("organizations"),
    accountSid: v.string(),
    authToken: v.string(), // encrypted
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        twilioMaster: {
          accountSid: args.accountSid,
          authToken: args.authToken,
          isConfigured: true,
        },
      },
      updatedAt: Date.now(),
    });
  },
});

// Internal query to check if platform org exists
export const hasPlatformOrg = internalQuery({
  args: {},
  handler: async (ctx) => {
    const platformOrg = await ctx.db
      .query("organizations")
      .withIndex("by_is_platform", (q) => q.eq("isPlatformOrg", true))
      .first();
    return platformOrg !== null;
  },
});

// Query to check if current org is the platform org
export const isPlatformOrg = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();
    return org?.isPlatformOrg === true;
  },
});

// Query to get all tenant organizations (excluding platform org)
export const getAllTenants = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("organizations").collect();
    return all.filter(org => !org.isPlatformOrg);
  },
});

// Query to get all organizations (for platform admins)
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("organizations").collect();
  },
});

// Query to get organization by ID
export const getById = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});

// Query to get organization by Clerk ID (alias for getCurrent)
export const getByClerkId = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();
  },
});

// Mutation to create organization with full business and billing details
// Called by admin when creating a new tenant
export const createWithDetails = mutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    businessInfo: v.object({
      streetAddress: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      phone: v.string(),
      ownerName: v.string(),
      ownerEmail: v.string(),
    }),
    billing: v.object({
      basePlanPrice: v.number(),
      perUserPrice: v.number(),
      includedUsers: v.number(),
      billingEmail: v.optional(v.string()),
    }),
    agencyTypeId: v.optional(v.id("agencyTypes")),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (existing) {
      // Update existing org with businessInfo and billing
      await ctx.db.patch(existing._id, {
        businessInfo: args.businessInfo,
        billing: args.billing,
        ...(args.agencyTypeId !== undefined && { agencyTypeId: args.agencyTypeId }),
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new organization
    const now = Date.now();
    return await ctx.db.insert("organizations", {
      clerkOrgId: args.clerkOrgId,
      name: args.name,
      slug: args.slug,
      plan: "starter",
      businessInfo: args.businessInfo,
      billing: args.billing,
      ...(args.agencyTypeId && { agencyTypeId: args.agencyTypeId }),
      settings: {
        recordingEnabled: false,
        maxConcurrentCalls: 5,
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Internal mutation to create organization from Clerk webhook
export const createFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    isPlatformOrg: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (existing) {
      return existing._id;
    }

    // If marking as platform org, check if one already exists
    if (args.isPlatformOrg) {
      const existingPlatform = await ctx.db
        .query("organizations")
        .withIndex("by_is_platform", (q) => q.eq("isPlatformOrg", true))
        .first();
      if (existingPlatform) {
        throw new Error("A platform organization already exists");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("organizations", {
      clerkOrgId: args.clerkOrgId,
      name: args.name,
      slug: args.slug,
      isPlatformOrg: args.isPlatformOrg,
      plan: args.isPlatformOrg ? "enterprise" : "free",
      settings: {
        recordingEnabled: false,
        maxConcurrentCalls: args.isPlatformOrg ? 100 : 5,
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Mutation to mark an organization as the platform org (one-time setup)
export const setPlatformOrg = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Check if a platform org already exists
    const existingPlatform = await ctx.db
      .query("organizations")
      .withIndex("by_is_platform", (q) => q.eq("isPlatformOrg", true))
      .first();

    if (existingPlatform) {
      throw new Error("A platform organization already exists");
    }

    await ctx.db.patch(args.organizationId, {
      isPlatformOrg: true,
      plan: "enterprise",
      settings: {
        recordingEnabled: true,
        maxConcurrentCalls: 100,
      },
      updatedAt: Date.now(),
    });
  },
});

// Internal mutation to update organization from Clerk webhook
// Also creates the org if it doesn't exist (upsert behavior)
export const updateFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (org) {
      // Update existing org
      await ctx.db.patch(org._id, {
        name: args.name,
        ...(args.slug && { slug: args.slug }),
        updatedAt: Date.now(),
      });
    } else {
      // Create org if it doesn't exist (for orgs created before webhook was set up)
      const now = Date.now();
      await ctx.db.insert("organizations", {
        clerkOrgId: args.clerkOrgId,
        name: args.name,
        slug: args.slug || args.clerkOrgId,
        plan: "free",
        settings: {
          recordingEnabled: false,
          maxConcurrentCalls: 5,
        },
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Mutation to ensure organization exists (creates if it doesn't)
// This is useful when the webhook hasn't synced the org yet
export const ensureOrganization = mutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if org already exists
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create the organization
    const now = Date.now();
    return await ctx.db.insert("organizations", {
      clerkOrgId: args.clerkOrgId,
      name: args.name,
      slug: args.slug,
      plan: "free",
      settings: {
        recordingEnabled: false,
        maxConcurrentCalls: 5,
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Mutation to update tenant details (business info and billing)
export const updateTenantDetails = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    businessInfo: v.object({
      streetAddress: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      phone: v.string(),
      ownerName: v.string(),
      ownerEmail: v.string(),
    }),
    billing: v.object({
      basePlanPrice: v.number(),
      perUserPrice: v.number(),
      includedUsers: v.number(),
      billingEmail: v.optional(v.string()),
    }),
    agencyTypeId: v.optional(v.id("agencyTypes")),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      name: args.name,
      businessInfo: args.businessInfo,
      billing: args.billing,
      ...(args.agencyTypeId !== undefined && { agencyTypeId: args.agencyTypeId }),
      updatedAt: Date.now(),
    });
  },
});

// Mutation to update business info only (for tenant self-edit - no billing access)
export const updateBusinessInfo = mutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    businessInfo: v.object({
      streetAddress: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      phone: v.string(),
      ownerName: v.string(),
      ownerEmail: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    // Find org by Clerk org ID
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (!org) throw new Error("Organization not found");

    // Update only name and business info (not billing)
    await ctx.db.patch(org._id, {
      name: args.name,
      businessInfo: args.businessInfo,
      updatedAt: Date.now(),
    });
  },
});

// Mutation to update organization settings
export const updateSettings = mutation({
  args: {
    organizationId: v.id("organizations"),
    settings: v.object({
      recordingEnabled: v.optional(v.boolean()),
      holdMusicUrl: v.optional(v.string()),
      maxConcurrentCalls: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await authorizeOrgAdmin(ctx, args.organizationId);
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        ...args.settings,
      },
      updatedAt: Date.now(),
    });
  },
});

// Mutation to update Twilio credentials for an organization
export const updateTwilioCredentials = mutation({
  args: {
    organizationId: v.id("organizations"),
    twilioCredentials: v.object({
      accountSid: v.string(),
      authToken: v.string(),
      apiKey: v.optional(v.string()),
      apiSecret: v.optional(v.string()),
      twimlAppSid: v.optional(v.string()),
      isAutoProvisioned: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    await authorizeOrgAdmin(ctx, args.organizationId);
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        twilioCredentials: {
          ...args.twilioCredentials,
          isConfigured: true,
        },
      },
      // Top-level for webhook routing lookup
      twilioAccountSid: args.twilioCredentials.accountSid,
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      organizationId: args.organizationId,
      action: "twilio_credentials.updated",
      entityType: "organization",
      entityId: args.organizationId,
    });
  },
});

// Query to get Twilio credentials for an organization (returns masked auth token)
export const getTwilioCredentials = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;

    const creds = org.settings.twilioCredentials;
    if (!creds) return null;

    // Return credentials with masked auth token for security
    return {
      accountSid: creds.accountSid,
      authToken: creds.authToken ? "••••••••" + creds.authToken.slice(-4) : "",
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret ? "••••••••" + creds.apiSecret.slice(-4) : "",
      twimlAppSid: creds.twimlAppSid,
      isConfigured: creds.isConfigured,
    };
  },
});

// Internal query to get full Twilio credentials (for server-side token generation)
// This returns unmasked credentials - only use from trusted server-side code
export const getTwilioCredentialsInternal = internalQuery({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (!org) return null;

    const creds = org.settings.twilioCredentials;
    if (!creds || !creds.isConfigured) return null;

    // Return full credentials for server-side use
    return {
      accountSid: creds.accountSid,
      authToken: creds.authToken,
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
      twimlAppSid: creds.twimlAppSid,
      isConfigured: creds.isConfigured,
    };
  },
});

// Mutation to delete an organization and all its related data (cascade delete)
export const deleteOrganization = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeSuperAdmin(ctx);
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await writeAuditLog(ctx, {
      organizationId: args.organizationId,
      action: "organization.deleted",
      entityType: "organization",
      entityId: args.organizationId,
      metadata: { name: org.name },
    });

    // Prevent deleting platform org
    if (org.isPlatformOrg) {
      throw new Error("Cannot delete the platform organization");
    }

    // 1. Delete all users in this org
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const user of users) {
      await ctx.db.delete(user._id);
    }

    // 2. Delete all phone numbers
    const phoneNumbers = await ctx.db
      .query("phoneNumbers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const phone of phoneNumbers) {
      await ctx.db.delete(phone._id);
    }

    // 3. Delete all active calls
    const activeCalls = await ctx.db
      .query("activeCalls")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const call of activeCalls) {
      await ctx.db.delete(call._id);
    }

    // 4. Delete call history
    const callHistory = await ctx.db
      .query("callHistory")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const record of callHistory) {
      await ctx.db.delete(record._id);
    }

    // 5. Delete parking lots
    const parkingLots = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const lot of parkingLots) {
      await ctx.db.delete(lot._id);
    }

    // 6. Delete presence records
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const p of presence) {
      await ctx.db.delete(p._id);
    }

    // 7. Delete contacts
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const contact of contacts) {
      await ctx.db.delete(contact._id);
    }

    // 8. Delete sales and sale line items
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const sale of sales) {
      const saleItems = await ctx.db
        .query("saleLineItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      for (const item of saleItems) {
        await ctx.db.delete(item._id);
      }
      await ctx.db.delete(sale._id);
    }

    // 8b. Delete sale types
    const saleTypesDelete = await ctx.db
      .query("saleTypes")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const st of saleTypesDelete) {
      await ctx.db.delete(st._id);
    }

    // 9. Delete tenant carriers
    const tenantCarriers = await ctx.db
      .query("tenantCarriers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const tc of tenantCarriers) {
      await ctx.db.delete(tc._id);
    }

    // 9. Delete tenant products
    const tenantProducts = await ctx.db
      .query("tenantProducts")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const tp of tenantProducts) {
      await ctx.db.delete(tp._id);
    }

    // 10. Delete tenant commissions
    const tenantComms = await ctx.db
      .query("tenantCommissions")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const tc of tenantComms) {
      await ctx.db.delete(tc._id);
    }

    // 11. Delete sales goals
    const salesGoals = await ctx.db
      .query("salesGoals")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const goal of salesGoals) {
      await ctx.db.delete(goal._id);
    }

    // 12. Finally delete the organization
    await ctx.db.delete(args.organizationId);
  },
});

// Internal mutation to delete organization from Clerk webhook
// Called when an organization is deleted in Clerk
export const deleteFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the organization by Clerk org ID
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (!org) {
      return;
    }

    // Prevent deleting platform org via webhook
    if (org.isPlatformOrg) {
      return;
    }

    const organizationId = org._id;

    // 1. Delete all users in this org
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const user of users) {
      await ctx.db.delete(user._id);
    }

    // 2. Delete all phone numbers
    const phoneNumbers = await ctx.db
      .query("phoneNumbers")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const phone of phoneNumbers) {
      await ctx.db.delete(phone._id);
    }

    // 3. Delete all active calls
    const activeCalls = await ctx.db
      .query("activeCalls")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const call of activeCalls) {
      await ctx.db.delete(call._id);
    }

    // 4. Delete call history
    const callHistory = await ctx.db
      .query("callHistory")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const record of callHistory) {
      await ctx.db.delete(record._id);
    }

    // 5. Delete parking lots
    const parkingLots = await ctx.db
      .query("parkingLots")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const lot of parkingLots) {
      await ctx.db.delete(lot._id);
    }

    // 6. Delete presence records
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const p of presence) {
      await ctx.db.delete(p._id);
    }

    // 7. Delete contacts
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const contact of contacts) {
      await ctx.db.delete(contact._id);
    }

    // 8. Delete sales and sale line items
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const sale of sales) {
      const saleItems = await ctx.db
        .query("saleLineItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      for (const item of saleItems) {
        await ctx.db.delete(item._id);
      }
      await ctx.db.delete(sale._id);
    }

    // 8b. Delete sale types
    const saleTypesCleanup = await ctx.db
      .query("saleTypes")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const st of saleTypesCleanup) {
      await ctx.db.delete(st._id);
    }

    // 9. Delete sales goals
    const salesGoals = await ctx.db
      .query("salesGoals")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const goal of salesGoals) {
      await ctx.db.delete(goal._id);
    }

    // 10. Finally delete the organization
    await ctx.db.delete(organizationId);
  },
});

// =====================
// ONBOARDING FUNCTIONS
// =====================

// Query to check if onboarding is needed for a tenant
export const getOnboardingStatus = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (!org) {
      return { needsOnboarding: false, reason: "org_not_found" };
    }

    // Platform org doesn't need onboarding
    if (org.isPlatformOrg) {
      return { needsOnboarding: false, reason: "platform_org" };
    }

    // Check if onboarding was completed
    if (org.onboarding?.completedAt) {
      return {
        needsOnboarding: false,
        reason: "completed",
        completedAt: org.onboarding.completedAt,
      };
    }

    // Check if onboarding was skipped
    if (org.onboarding?.skippedAt) {
      return {
        needsOnboarding: false,
        reason: "skipped",
        skippedAt: org.onboarding.skippedAt,
        twilioConfigured: org.settings.twilioCredentials?.isConfigured ?? false,
      };
    }

    // Onboarding is needed
    return {
      needsOnboarding: true,
      reason: "not_started",
      currentStep: org.onboarding?.currentStep ?? 0,
      twilioConfigured: org.settings.twilioCredentials?.isConfigured ?? false,
    };
  },
});

// Mutation to update onboarding progress (save current step)
export const updateOnboardingProgress = mutation({
  args: {
    clerkOrgId: v.string(),
    step: v.number(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(org._id, {
      onboarding: {
        ...org.onboarding,
        currentStep: args.step,
      },
      updatedAt: Date.now(),
    });
  },
});

// Mutation to mark onboarding as complete
export const completeOnboarding = mutation({
  args: {
    clerkOrgId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(org._id, {
      onboarding: {
        ...org.onboarding,
        completedAt: Date.now(),
        currentStep: 5, // Final step
      },
      updatedAt: Date.now(),
    });
  },
});

// Mutation to skip onboarding (user can configure later)
export const skipOnboarding = mutation({
  args: {
    clerkOrgId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(org._id, {
      onboarding: {
        ...org.onboarding,
        skippedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});

// Mutation to save Twilio credentials during onboarding
export const saveTwilioCredentials = mutation({
  args: {
    organizationId: v.id("organizations"),
    accountSid: v.string(),
    authToken: v.string(),
    apiKey: v.optional(v.string()),
    apiSecret: v.optional(v.string()),
    twimlAppSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        twilioCredentials: {
          accountSid: args.accountSid,
          authToken: args.authToken,
          apiKey: args.apiKey,
          apiSecret: args.apiSecret,
          twimlAppSid: args.twimlAppSid,
          isConfigured: true,
        },
      },
      updatedAt: Date.now(),
    });
  },
});

// Save auto-provisioned Twilio subaccount credentials (no auth check - called from server actions)
export const saveAutoProvisionedCredentials = mutation({
  args: {
    organizationId: v.id("organizations"),
    twilioCredentials: v.object({
      accountSid: v.string(),
      authToken: v.string(),
      apiKey: v.optional(v.string()),
      apiSecret: v.optional(v.string()),
      twimlAppSid: v.optional(v.string()),
      isConfigured: v.boolean(),
      isAutoProvisioned: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      twilioAccountSid: args.twilioCredentials.accountSid,
      settings: {
        ...org.settings,
        twilioCredentials: args.twilioCredentials,
      },
      updatedAt: Date.now(),
    });
  },
});

// Update National General portal credentials
export const updateNatgenCredentials = mutation({
  args: {
    organizationId: v.id("organizations"),
    username: v.string(),
    password: v.string(),
    portalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auth handled by API route (Clerk check)
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        natgenCredentials: {
          username: args.username,
          password: args.password,
          portalUrl: args.portalUrl,
          isConfigured: true,
        },
      },
      updatedAt: Date.now(),
    });
  },
});

// Remove National General portal credentials
export const removeNatgenCredentials = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Auth handled by API route (Clerk check)
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const { natgenCredentials, ...restSettings } = org.settings as any;
    await ctx.db.patch(args.organizationId, {
      settings: restSettings,
      updatedAt: Date.now(),
    });
  },
});

// Update Retell AI credentials
export const updateRetellCredentials = mutation({
  args: {
    organizationId: v.id("organizations"),
    retellApiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        retellApiKey: args.retellApiKey,
        retellConfigured: true,
      },
      updatedAt: Date.now(),
    });
  },
});

// Remove Retell AI credentials
export const removeRetellCredentials = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const { retellApiKey, retellConfigured, ...restSettings } = org.settings as any;
    await ctx.db.patch(args.organizationId, {
      settings: restSettings,
      updatedAt: Date.now(),
    });
  },
});
