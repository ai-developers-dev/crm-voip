import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Query to get current platform user
export const getCurrent = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
  },
});

// Query to check if user is a platform user (super_admin or platform_staff)
export const isPlatformUser = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    return user !== null && user.isActive;
  },
});

// Query to check if user is super_admin
export const isSuperAdmin = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    return user !== null && user.isActive && user.role === "super_admin";
  },
});

// Query to get all platform users
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("platformUsers").collect();
  },
});

// Internal query to check if any super_admin exists
export const hasAnySuperAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    const superAdmin = await ctx.db
      .query("platformUsers")
      .filter((q) => q.eq(q.field("role"), "super_admin"))
      .first();
    return superAdmin !== null;
  },
});

// Bootstrap mutation - creates the first super_admin
// This can only be called once when no super_admin exists
export const bootstrapSuperAdmin = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if any super_admin already exists
    const existingSuperAdmin = await ctx.db
      .query("platformUsers")
      .filter((q) => q.eq(q.field("role"), "super_admin"))
      .first();

    if (existingSuperAdmin) {
      throw new Error("A super_admin already exists. Bootstrap can only be called once.");
    }

    // Check if this user is already a platform user
    const existingUser = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (existingUser) {
      // Upgrade existing user to super_admin
      await ctx.db.patch(existingUser._id, {
        role: "super_admin",
        isActive: true,
        updatedAt: Date.now(),
      });
      return existingUser._id;
    }

    const now = Date.now();
    return await ctx.db.insert("platformUsers", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      role: "super_admin",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Internal mutation to create platform user from webhook
export const upsertFromClerk = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    role: v.union(v.literal("super_admin"), v.literal("platform_staff")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        avatarUrl: args.avatarUrl,
        role: args.role,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("platformUsers", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      role: args.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Mutation to add a new platform user (only super_admin can do this)
export const addPlatformUser = mutation({
  args: {
    requestingUserId: v.string(), // The clerk user ID of the person making the request
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("super_admin"), v.literal("platform_staff")),
  },
  handler: async (ctx, args) => {
    // Verify the requesting user is a super_admin
    const requestingUser = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.requestingUserId))
      .first();

    if (!requestingUser || requestingUser.role !== "super_admin") {
      throw new Error("Only super_admin can add platform users");
    }

    // Check if user already exists
    const existing = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (existing) {
      throw new Error("User already exists as a platform user");
    }

    const now = Date.now();
    return await ctx.db.insert("platformUsers", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      role: args.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Mutation to update platform user role
export const updateRole = mutation({
  args: {
    requestingUserId: v.string(),
    targetUserId: v.id("platformUsers"),
    role: v.union(v.literal("super_admin"), v.literal("platform_staff")),
  },
  handler: async (ctx, args) => {
    // Verify the requesting user is a super_admin
    const requestingUser = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.requestingUserId))
      .first();

    if (!requestingUser || requestingUser.role !== "super_admin") {
      throw new Error("Only super_admin can update platform user roles");
    }

    await ctx.db.patch(args.targetUserId, {
      role: args.role,
      updatedAt: Date.now(),
    });
  },
});

// Mutation to deactivate platform user
export const deactivate = mutation({
  args: {
    requestingUserId: v.string(),
    targetUserId: v.id("platformUsers"),
  },
  handler: async (ctx, args) => {
    // Verify the requesting user is a super_admin
    const requestingUser = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.requestingUserId))
      .first();

    if (!requestingUser || requestingUser.role !== "super_admin") {
      throw new Error("Only super_admin can deactivate platform users");
    }

    // Prevent deactivating yourself
    const targetUser = await ctx.db.get(args.targetUserId);
    if (targetUser?.clerkUserId === args.requestingUserId) {
      throw new Error("Cannot deactivate yourself");
    }

    await ctx.db.patch(args.targetUserId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});
