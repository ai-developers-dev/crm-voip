import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Generate a signed upload URL for uploading hold music to Convex storage.
 * The client will use this URL to upload the MP3 file directly.
 */
export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Verify org exists
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Save the uploaded file reference to the organization settings.
 * Called after the file has been uploaded to storage.
 */
export const saveHoldMusic = mutation({
  args: {
    organizationId: v.id("organizations"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Delete old file if it exists
    if (org.settings?.holdMusicStorageId) {
      await ctx.storage.delete(org.settings.holdMusicStorageId);
    }

    // Get the public URL for the uploaded file
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Failed to get URL for uploaded file");
    }

    // Update org settings with the new storage ID and URL
    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        holdMusicStorageId: args.storageId,
        holdMusicUrl: url,
      },
      updatedAt: Date.now(),
    });

    return { success: true, url };
  },
});

/**
 * Delete the custom hold music from storage and clear the org setting.
 */
export const deleteHoldMusic = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Delete the file from storage if it exists
    if (org.settings?.holdMusicStorageId) {
      await ctx.storage.delete(org.settings.holdMusicStorageId);
    }

    // Clear the settings
    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        holdMusicStorageId: undefined,
        holdMusicUrl: undefined,
      },
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Get the hold music URL for an organization.
 * Returns null if no custom hold music is configured.
 */
export const getHoldMusicUrl = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    return org?.settings?.holdMusicUrl || null;
  },
});

/**
 * Get hold music URL by Clerk org ID.
 * Used by the hold music endpoint when org context comes from TwiML.
 */
export const getHoldMusicByClerkId = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .first();

    return org?.settings?.holdMusicUrl || null;
  },
});
