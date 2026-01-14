import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Query to get current user
export const getCurrent = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
  },
});

// Query to get a user by their Clerk ID and organization
export const getByClerkId = query({
  args: {
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Find user by clerk ID, then verify they're in the right org
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .collect();

    return users.find((u) => u.organizationId === args.organizationId) ?? null;
  },
});

// Query to get all users in an organization
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

// Query to get all users in an organization with their daily metrics
export const getByOrganizationWithMetrics = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    // Get all users
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Get today's metrics for all users in this org
    const metrics = await ctx.db
      .query("userDailyMetrics")
      .withIndex("by_organization_date", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", today)
      )
      .collect();

    // Create a map for quick lookup
    const metricsMap = new Map(metrics.map((m) => [m.userId, m]));

    // Combine users with their metrics
    return users.map((user) => ({
      ...user,
      todayMetrics: metricsMap.get(user._id) || {
        callsAccepted: 0,
        talkTimeSeconds: 0,
      },
    }));
  },
});

// Query to get current user by organization (uses Clerk identity)
export const getCurrentByOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Get the Clerk user ID from the identity
    // Clerk identity subject format: "user_xxxx"
    const clerkUserId = identity.subject;

    // Find the user in this organization
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();

    return users.find((u) => u.organizationId === args.organizationId) ?? null;
  },
});

// Query to get available users in an organization
export const getAvailable = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "available")
      )
      .collect();
  },
});

// Internal mutation to upsert user from Clerk webhook
export const upsertFromClerk = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        avatarUrl: args.avatarUrl,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Note: User without organization will be created when they join an org
    return null;
  },
});

// Internal mutation to add user to organization
export const addToOrganization = internalMutation({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
    role: v.union(
      v.literal("tenant_admin"),
      v.literal("supervisor"),
      v.literal("agent")
    ),
  },
  handler: async (ctx, args) => {
    // Get organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (!org) {
      console.error(`Organization not found: ${args.clerkOrgId}`);
      return null;
    }

    // Check if user already exists in this org
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (existing && existing.organizationId === org._id) {
      // Update role if different
      if (existing.role !== args.role) {
        await ctx.db.patch(existing._id, { role: args.role, updatedAt: Date.now() });
      }
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      organizationId: org._id,
      email: "",
      name: "New User",
      role: args.role,
      status: "offline",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Internal mutation to remove user from organization
export const removeFromOrganization = internalMutation({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (!org) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (user && user.organizationId === org._id) {
      await ctx.db.delete(user._id);
    }
  },
});

// Internal mutation to delete user from Clerk webhook
export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});

// Mutation to update user status
export const updateStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("available"),
      v.literal("busy"),
      v.literal("on_call"),
      v.literal("on_break"),
      v.literal("offline")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// Mutation to toggle user status between available and offline
export const toggleStatus = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const newStatus = user.status === "offline" ? "available" : "offline";
    await ctx.db.patch(args.userId, {
      status: newStatus,
      updatedAt: Date.now(),
    });

    return newStatus;
  },
});

// Mutation to update user details (for settings page)
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.union(
      v.literal("tenant_admin"),
      v.literal("supervisor"),
      v.literal("agent")
    )),
    extension: v.optional(v.string()),
    directNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(userId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Query to get available agents for incoming calls
// First checks presence heartbeats, falls back to user status if no presence records
export const getAvailableAgents = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Get the organization to retrieve the Clerk org ID (needed for Twilio client identity)
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      return [];
    }

    // Get presence records for this org that are recent (within 30s) and available
    const now = Date.now();
    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Filter to only available, recent heartbeats
    const availablePresence = presenceRecords.filter(
      (p) =>
        now - p.lastHeartbeat < 30000 &&
        (p.status === "available" || p.status === "on_break")
    );

    // If we have presence records, use those
    if (availablePresence.length > 0) {
      const agents = await Promise.all(
        availablePresence.map(async (presence) => {
          const user = await ctx.db.get(presence.userId);
          if (!user) return null;
          return {
            _id: user._id,
            clerkUserId: user.clerkUserId,
            clerkOrgId: organization.clerkOrgId,
            name: user.name,
            role: user.role,
            status: presence.status,
            twilioIdentity: `${organization.clerkOrgId}-${user.clerkUserId}`,
          };
        })
      );
      return agents.filter((a): a is NonNullable<typeof a> => a !== null);
    }

    // Fallback: If no presence records, check users with status "available"
    // This matches the simpler Supabase implementation approach
    const availableUsers = await ctx.db
      .query("users")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "available")
      )
      .collect();

    return availableUsers.map((user) => ({
      _id: user._id,
      clerkUserId: user.clerkUserId,
      clerkOrgId: organization.clerkOrgId,
      name: user.name,
      role: user.role,
      status: user.status,
      twilioIdentity: `${organization.clerkOrgId}-${user.clerkUserId}`,
    }));
  },
});

// Mutation to delete a user
export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Delete the user
    await ctx.db.delete(args.userId);
  },
});

// Mutation to create a user manually (for display-only agents or manual entry)
export const createUser = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("tenant_admin"),
      v.literal("supervisor"),
      v.literal("agent")
    ),
    extension: v.optional(v.string()),
    directNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const now = Date.now();
    return await ctx.db.insert("users", {
      clerkUserId: `manual_${now}`, // Placeholder for manually created users
      organizationId: args.organizationId,
      email: args.email,
      name: args.name,
      role: args.role,
      extension: args.extension,
      directNumber: args.directNumber,
      status: "offline",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Mutation to sync current user from Clerk (creates with real Clerk ID)
export const syncFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("tenant_admin"),
      v.literal("supervisor"),
      v.literal("agent")
    ),
  },
  handler: async (ctx, args) => {
    // Get the organization by Clerk ID
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    if (!org) {
      throw new Error(`Organization not found: ${args.clerkOrgId}`);
    }

    // Check if user already exists in this org
    const existingUsers = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .collect();

    const existingInOrg = existingUsers.find((u) => u.organizationId === org._id);

    if (existingInOrg) {
      // Update existing user
      await ctx.db.patch(existingInOrg._id, {
        name: args.name,
        email: args.email,
        role: args.role,
        updatedAt: Date.now(),
      });
      return existingInOrg._id;
    }

    // Create new user with real Clerk ID
    const now = Date.now();
    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId, // Real Clerk ID!
      organizationId: org._id,
      email: args.email,
      name: args.name,
      role: args.role,
      status: "available", // Start as available so they can receive calls
      createdAt: now,
      updatedAt: now,
    });
  },
});
