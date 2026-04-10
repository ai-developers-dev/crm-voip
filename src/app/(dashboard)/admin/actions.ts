"use server";

import { clerkClient, auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { provisionTenant } from "@/lib/twilio/provisioning";
import { encrypt, decrypt } from "@/lib/credentials/crypto";
import { getStripeClient } from "@/lib/stripe/client";

async function getConvexClient() {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

  // Try to get Convex auth token if JWT template exists
  try {
    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    if (token) {
      convex.setAuth(token);
    }
  } catch {
    // JWT template may not exist - proceed without auth
  }

  return convex;
}

/**
 * Verify the caller is a platform admin before performing admin actions.
 * Throws if not authenticated or not a platform admin.
 */
async function requirePlatformAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const convex = await getConvexClient();
  const isSuperAdmin = await convex.query(api.platformUsers.isSuperAdmin, { clerkUserId: userId });
  if (!isSuperAdmin) {
    const isPlatform = await convex.query(api.platformUsers.isPlatformUser, { clerkUserId: userId });
    if (!isPlatform) throw new Error("Not authorized — platform admin required");
  }
}

export interface CreateTenantData {
  businessName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  ownerName: string;
  ownerEmail: string;
  // Billing
  basePlanPrice: number;
  perUserPrice: number;
  includedUsers: number;
  // Agency type
  agencyTypeId?: string;
}

export async function createTenant(data: CreateTenantData) {
  try {
    await requirePlatformAdmin();
    const clerk = await clerkClient();
    const convex = await getConvexClient();

    // Create slug from business name
    const slug = data.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // 1. Create the organization in Clerk
    const org = await clerk.organizations.createOrganization({
      name: data.businessName,
      slug: slug,
      publicMetadata: {
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        zip: data.zip,
        phone: data.phone,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
      },
    });

    console.log(`Created organization in Clerk: ${org.id}`);

    // 2. Create the organization in Convex with full details
    // (Webhook may also create it, but this ensures we have businessInfo and billing)
    const convexOrgId = await convex.mutation(api.organizations.createWithDetails, {
      clerkOrgId: org.id,
      name: data.businessName,
      slug: slug,
      businessInfo: {
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        zip: data.zip,
        phone: data.phone,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
      },
      billing: {
        basePlanPrice: data.basePlanPrice,
        perUserPrice: data.perUserPrice,
        includedUsers: data.includedUsers,
        billingEmail: data.ownerEmail,
      },
      agencyTypeId: data.agencyTypeId as any,
    });

    console.log(`Created organization in Convex with billing info: ${convexOrgId}`);

    // 2b. Auto-provision Twilio subaccount if master Twilio is configured
    try {
      const platformOrg = await convex.query(api.organizations.getPlatformOrg);
      const twilioMaster = platformOrg?.settings?.twilioMaster;
      if (twilioMaster?.isConfigured && platformOrg) {
        const masterAuth = decrypt(twilioMaster.authToken, platformOrg._id);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

        const twilioResult = await provisionTenant(
          twilioMaster.accountSid,
          masterAuth,
          data.businessName,
          appUrl
        );

        // Encrypt subaccount credentials before storing
        const encryptedAuth = encrypt(twilioResult.authToken, convexOrgId);
        const encryptedSecret = twilioResult.apiSecret
          ? encrypt(twilioResult.apiSecret, convexOrgId)
          : undefined;

        await convex.mutation(api.organizations.saveAutoProvisionedCredentials, {
          organizationId: convexOrgId,
          twilioCredentials: {
            accountSid: twilioResult.accountSid,
            authToken: encryptedAuth,
            apiKey: twilioResult.apiKey,
            apiSecret: encryptedSecret,
            twimlAppSid: twilioResult.twimlAppSid,
            isConfigured: true,
            isAutoProvisioned: true,
          },
        });

        console.log(`Auto-provisioned Twilio subaccount for ${data.businessName}`);
      }
    } catch (provisionErr) {
      // Non-fatal: tenant can still set up Twilio manually
      console.error("Failed to auto-provision Twilio subaccount:", provisionErr);
    }

    // 2c. Create Stripe customer
    try {
      const stripe = getStripeClient();
      const customer = await stripe.customers.create({
        name: data.businessName,
        email: data.ownerEmail,
        metadata: { organizationId: convexOrgId, clerkOrgId: org.id },
      });

      await convex.mutation(api.billing.updateStripeCustomer, {
        organizationId: convexOrgId,
        stripeCustomerId: customer.id,
      });
      console.log(`Created Stripe customer for ${data.businessName}: ${customer.id}`);
    } catch (stripeErr) {
      // Non-fatal: billing can be set up later
      console.error("Failed to create Stripe customer:", stripeErr);
    }

    // 3. Find or invite the owner
    // First, check if a user with this email already exists in Clerk
    const existingUsers = await clerk.users.getUserList({
      emailAddress: [data.ownerEmail],
    });

    if (existingUsers.data.length > 0) {
      // User exists - add them directly to the organization as admin
      const ownerUser = existingUsers.data[0];
      await clerk.organizations.createOrganizationMembership({
        organizationId: org.id,
        userId: ownerUser.id,
        role: "org:admin",
      });
      console.log(`Added existing user ${data.ownerEmail} as org admin`);
    } else {
      // User doesn't exist - create an invitation
      // Get current user (platform admin) to use as inviter
      const { userId } = await auth();
      if (userId) {
        // First add platform admin to org temporarily to send invite
        await clerk.organizations.createOrganizationMembership({
          organizationId: org.id,
          userId: userId,
          role: "org:admin",
        });

        // Now send the invitation
        await clerk.organizations.createOrganizationInvitation({
          organizationId: org.id,
          emailAddress: data.ownerEmail,
          role: "org:admin",
          inviterUserId: userId,
        });

        // Remove platform admin from tenant org (they shouldn't be a member)
        await clerk.organizations.deleteOrganizationMembership({
          organizationId: org.id,
          userId: userId,
        });

        console.log(`Sent invitation to ${data.ownerEmail}`);
      } else {
        console.log(`Could not send invitation - no authenticated user`);
      }
    }

    const monthlyTotal = data.basePlanPrice + (data.perUserPrice * Math.max(0, data.includedUsers - 1));

    return {
      success: true,
      organizationId: org.id,
      message: `Tenant "${data.businessName}" created. Invitation sent to ${data.ownerEmail}. Monthly: $${monthlyTotal}`
    };
  } catch (error: any) {
    console.error("Failed to create tenant:", error);

    // Extract detailed Clerk error if available
    let errorMessage = error.message || "Failed to create tenant";
    if (error.errors && Array.isArray(error.errors)) {
      const clerkErrors = error.errors.map((e: any) => e.message || e.longMessage || e.code).join(", ");
      if (clerkErrors) {
        errorMessage = clerkErrors;
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

export interface UpdateTenantData {
  organizationId: Id<"organizations">;
  businessName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  ownerName: string;
  ownerEmail: string;
  basePlanPrice: number;
  perUserPrice: number;
  includedUsers: number;
  agencyTypeId?: string;
}

export async function updateTenant(data: UpdateTenantData) {
  try {
    await requirePlatformAdmin();
    const convex = await getConvexClient();
    const clerk = await clerkClient();

    // Get the existing org
    const org = await convex.query(api.organizations.getById, { organizationId: data.organizationId });
    if (!org) {
      return { success: false, error: "Organization not found" };
    }

    // Update Clerk organization if name changed
    if (org.clerkOrgId && org.name !== data.businessName) {
      await clerk.organizations.updateOrganization(org.clerkOrgId, {
        name: data.businessName,
        publicMetadata: {
          streetAddress: data.streetAddress,
          city: data.city,
          state: data.state,
          zip: data.zip,
          phone: data.phone,
          ownerName: data.ownerName,
          ownerEmail: data.ownerEmail,
        },
      });
    }

    // Update Convex organization
    await convex.mutation(api.organizations.updateTenantDetails, {
      organizationId: data.organizationId,
      name: data.businessName,
      businessInfo: {
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        zip: data.zip,
        phone: data.phone,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
      },
      billing: {
        basePlanPrice: data.basePlanPrice,
        perUserPrice: data.perUserPrice,
        includedUsers: data.includedUsers,
        billingEmail: data.ownerEmail,
      },
      agencyTypeId: data.agencyTypeId as any,
    });

    return {
      success: true,
      message: `Tenant "${data.businessName}" updated successfully`
    };
  } catch (error: any) {
    console.error("Failed to update tenant:", error);
    return {
      success: false,
      error: error.message || "Failed to update tenant"
    };
  }
}

// ============================================================================
// User Management Actions
// ============================================================================

export interface AddUserToOrgData {
  clerkOrgId: string;
  email: string;
  name: string;
  role: "tenant_admin" | "supervisor" | "agent";
}

/**
 * Add a user to an organization via Clerk.
 * If user exists in Clerk, adds them directly to the org.
 * If not, creates the user in Clerk first, then adds them to the org.
 * The Clerk webhook will create/update the user in Convex with the real Clerk ID.
 */
export async function addUserToOrganization(data: AddUserToOrgData) {
  await requirePlatformAdmin();
  const convex = await getConvexClient();
  let clerkUserId: string | null = null;

  try {
    const clerk = await clerkClient();

    // Map our roles to Clerk roles
    const clerkRole = data.role === "tenant_admin" ? "org:admin"
      : data.role === "supervisor" ? "org:supervisor"
      : "org:member";

    // Step 1: Check if user already exists in Clerk
    console.log(`[AddUser] Checking if ${data.email} exists in Clerk...`);
    const existingUsers = await clerk.users.getUserList({
      emailAddress: [data.email],
    });

    let isNewUser = false;
    let alreadyInOrg = false;

    if (existingUsers.data.length > 0) {
      // User exists in Clerk
      clerkUserId = existingUsers.data[0].id;
      console.log(`[AddUser] Found existing Clerk user: ${clerkUserId}`);

      // Check if already a member of this org
      try {
        const memberships = await clerk.organizations.getOrganizationMembershipList({
          organizationId: data.clerkOrgId,
        });
        alreadyInOrg = memberships.data.some(
          (m) => m.publicUserData?.userId === clerkUserId
        );
        console.log(`[AddUser] Already in org: ${alreadyInOrg}`);
      } catch (membershipErr) {
        console.error(`[AddUser] Error checking membership:`, membershipErr);
        // Continue anyway - we'll try to add them
      }
    } else {
      // User doesn't exist in Clerk - create them
      console.log(`[AddUser] Creating new Clerk user for ${data.email}`);
      isNewUser = true;

      const tempPassword = `Temp${Date.now()}!${Math.random().toString(36).slice(2, 10)}`;

      const newUser = await clerk.users.createUser({
        emailAddress: [data.email],
        firstName: data.name.split(" ")[0] || data.name,
        lastName: data.name.split(" ").slice(1).join(" ") || undefined,
        password: tempPassword,
        skipPasswordChecks: true,
      });

      clerkUserId = newUser.id;
      console.log(`[AddUser] Created new Clerk user: ${clerkUserId}`);
    }

    // Step 2: Add to org membership if not already there
    if (!alreadyInOrg && clerkUserId) {
      console.log(`[AddUser] Adding ${clerkUserId} to org ${data.clerkOrgId}`);
      await clerk.organizations.createOrganizationMembership({
        organizationId: data.clerkOrgId,
        userId: clerkUserId,
        role: clerkRole,
      });
      console.log(`[AddUser] Added to org membership`);
    }

  } catch (clerkErr: any) {
    console.error("[AddUser] Clerk error:", clerkErr);
    // If we have a clerkUserId, continue to create in Convex anyway
    if (!clerkUserId) {
      let errorMessage = clerkErr.message || "Failed to add user in Clerk";
      if (clerkErr.errors && Array.isArray(clerkErr.errors)) {
        const clerkErrors = clerkErr.errors.map((e: any) => e.message || e.longMessage || e.code).join(", ");
        if (clerkErrors) errorMessage = clerkErrors;
      }
      return { success: false, error: errorMessage };
    }
  }

  // Step 3: Create user in Convex (this should always happen if we have a clerkUserId)
  if (clerkUserId) {
    console.log(`[AddUser] Creating/updating user in Convex: ${clerkUserId}`);
    try {
      await convex.mutation(api.users.syncFromClerk, {
        clerkUserId: clerkUserId,
        clerkOrgId: data.clerkOrgId,
        name: data.name,
        email: data.email,
        role: data.role,
      });
      console.log(`[AddUser] Successfully created user in Convex`);
    } catch (convexErr: any) {
      console.error("[AddUser] Convex error:", convexErr);
      return {
        success: false,
        error: `User added to Clerk but Convex failed: ${convexErr.message}`
      };
    }

    return {
      success: true,
      message: `${data.name} has been added to the organization`,
      userId: clerkUserId,
    };
  }

  return { success: false, error: "Failed to get or create user" };
}

/**
 * Remove a user from an organization via Clerk.
 */
export async function removeUserFromOrganization(clerkOrgId: string, clerkUserId: string) {
  try {
    await requirePlatformAdmin();
    const clerk = await clerkClient();

    await clerk.organizations.deleteOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUserId,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Failed to remove user from organization:", error);
    return { success: false, error: error.message || "Failed to remove user" };
  }
}

// ============================================================================
// Tenant Management Actions
// ============================================================================

export async function deleteTenantFromClerk(organizationId: Id<"organizations">) {
  try {
    await requirePlatformAdmin();
    const convex = await getConvexClient();

    // First, get the organization from Convex to get the clerkOrgId
    const org = await convex.query(api.organizations.getById, { organizationId });

    if (!org) {
      return { success: false, error: "Organization not found in database" };
    }

    if (org.isPlatformOrg) {
      return { success: false, error: "Cannot delete the platform organization" };
    }

    const clerkOrgId = org.clerkOrgId;

    if (!clerkOrgId) {
      // If no Clerk org ID, just delete from Convex
      await convex.mutation(api.organizations.deleteOrganization, { organizationId });
      return { success: true };
    }

    // Delete from Clerk - this will trigger a webhook that deletes from Convex
    const clerk = await clerkClient();
    await clerk.organizations.deleteOrganization(clerkOrgId);

    // Also delete from Convex immediately (in case webhook is slow or fails)
    await convex.mutation(api.organizations.deleteOrganization, { organizationId });

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete tenant:", error);
    return {
      success: false,
      error: error.message || "Failed to delete tenant"
    };
  }
}

/**
 * Auto-provision a Twilio subaccount for an existing tenant that was created
 * before the master Twilio credentials were configured.
 *
 * Creates: subaccount + API key + TwiML app under the platform master,
 * encrypts the subaccount auth token and API secret, and stores them in Convex.
 *
 * Platform super_admin only.
 */
export async function provisionTenantTwilio(organizationId: Id<"organizations">) {
  try {
    await requirePlatformAdmin();
    const convex = await getConvexClient();

    // 1. Verify tenant exists and isn't already provisioned
    const tenant = await convex.query(api.organizations.getById, { organizationId });
    if (!tenant) {
      return { success: false, error: "Tenant not found" };
    }
    if (tenant.settings?.twilioCredentials?.isConfigured) {
      return {
        success: false,
        error: "Tenant already has Twilio credentials configured. Remove them first if you want to re-provision.",
      };
    }

    // 2. Load platform master Twilio credentials
    const platformOrg = await convex.query(api.organizations.getPlatformOrg);
    const twilioMaster = platformOrg?.settings?.twilioMaster;
    if (!twilioMaster?.isConfigured || !platformOrg) {
      return {
        success: false,
        error: "Platform master Twilio credentials are not configured. Set them up in Platform Settings first.",
      };
    }

    // 3. Decrypt master auth token and run provisioning
    const masterAuth = decrypt(twilioMaster.authToken, platformOrg._id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (!appUrl) {
      return {
        success: false,
        error: "NEXT_PUBLIC_APP_URL environment variable is not set. Required for Twilio webhook callbacks.",
      };
    }

    const twilioResult = await provisionTenant(
      twilioMaster.accountSid,
      masterAuth,
      tenant.name,
      appUrl
    );

    // 4. Encrypt subaccount credentials before storing
    const encryptedAuth = encrypt(twilioResult.authToken, organizationId);
    const encryptedSecret = twilioResult.apiSecret
      ? encrypt(twilioResult.apiSecret, organizationId)
      : undefined;

    await convex.mutation(api.organizations.saveAutoProvisionedCredentials, {
      organizationId,
      twilioCredentials: {
        accountSid: twilioResult.accountSid,
        authToken: encryptedAuth,
        apiKey: twilioResult.apiKey,
        apiSecret: encryptedSecret,
        twimlAppSid: twilioResult.twimlAppSid,
        isConfigured: true,
        isAutoProvisioned: true,
      },
    });

    return {
      success: true,
      subaccountSid: twilioResult.accountSid,
      message: `Twilio subaccount provisioned for ${tenant.name}`,
    };
  } catch (error: any) {
    console.error("Failed to provision tenant Twilio:", error);
    return {
      success: false,
      error: error.message || "Failed to provision Twilio subaccount",
    };
  }
}
