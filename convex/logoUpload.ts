import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorizeOrgAdmin } from "./lib/auth";

/**
 * Generate a signed upload URL for uploading an agency logo to Convex storage.
 */
export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgAdmin(ctx, args.organizationId);
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Save the uploaded logo reference to the organization settings.
 */
export const saveLogo = mutation({
  args: {
    organizationId: v.id("organizations"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await authorizeOrgAdmin(ctx, args.organizationId);
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Delete old logo if it exists
    if (org.settings?.logoStorageId) {
      await ctx.storage.delete(org.settings.logoStorageId);
    }

    // Get the public URL for the uploaded file
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Failed to get URL for uploaded file");
    }

    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        logoStorageId: args.storageId,
        logoUrl: url,
      },
      updatedAt: Date.now(),
    });

    return { success: true, url };
  },
});

/**
 * Delete the agency logo from storage and clear the org setting.
 */
export const deleteLogo = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgAdmin(ctx, args.organizationId);
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    if (org.settings?.logoStorageId) {
      await ctx.storage.delete(org.settings.logoStorageId);
    }

    await ctx.db.patch(args.organizationId, {
      settings: {
        ...org.settings,
        logoStorageId: undefined,
        logoUrl: undefined,
      },
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Get the logo URL for an organization.
 * Always generates a fresh URL from storageId (signed URLs expire).
 */
export const getLogoUrl = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org?.settings?.logoStorageId) {
      return null;
    }

    const freshUrl = await ctx.storage.getUrl(org.settings.logoStorageId);
    return freshUrl;
  },
});
