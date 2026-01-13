"use server";

import { clerkClient, auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

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
    // The mutations are public so this is fine
  }

  return convex;
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
}

export async function createTenant(data: CreateTenantData) {
  try {
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
    await convex.mutation(api.organizations.createWithDetails, {
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
    });

    console.log(`Created organization in Convex with billing info`);

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
}

export async function updateTenant(data: UpdateTenantData) {
  try {
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
 * If user exists in Clerk, adds them directly.
 * If not, sends an invitation.
 * The Clerk webhook will create/update the user in Convex with the real Clerk ID.
 */
export async function addUserToOrganization(data: AddUserToOrgData) {
  try {
    const clerk = await clerkClient();

    // Map our roles to Clerk roles
    const clerkRole = data.role === "tenant_admin" ? "org:admin"
      : data.role === "supervisor" ? "org:supervisor"
      : "org:member";

    // Check if user already exists in Clerk
    const existingUsers = await clerk.users.getUserList({
      emailAddress: [data.email],
    });

    if (existingUsers.data.length > 0) {
      // User exists - add them directly to the organization
      const user = existingUsers.data[0];

      // Check if already a member
      const memberships = await clerk.organizations.getOrganizationMembershipList({
        organizationId: data.clerkOrgId,
      });

      const existingMembership = memberships.data.find(
        (m) => m.publicUserData?.userId === user.id
      );

      if (existingMembership) {
        return {
          success: false,
          error: "User is already a member of this organization",
        };
      }

      await clerk.organizations.createOrganizationMembership({
        organizationId: data.clerkOrgId,
        userId: user.id,
        role: clerkRole,
      });

      console.log(`Added existing user ${data.email} to organization`);
      return {
        success: true,
        message: `${data.name} has been added to the organization`,
        userId: user.id,
      };
    } else {
      // User doesn't exist - create an invitation
      const { userId } = await auth();
      if (!userId) {
        return { success: false, error: "Not authenticated" };
      }

      // Check if there's already a pending invitation
      const invitations = await clerk.organizations.getOrganizationInvitationList({
        organizationId: data.clerkOrgId,
      });

      const existingInvite = invitations.data.find(
        (inv) => inv.emailAddress === data.email && inv.status === "pending"
      );

      if (existingInvite) {
        // Revoke the existing invitation and send a new one
        try {
          await clerk.organizations.revokeOrganizationInvitation({
            organizationId: data.clerkOrgId,
            invitationId: existingInvite.id,
            requestingUserId: userId,
          });
          console.log(`Revoked existing invitation for ${data.email}`);
        } catch (revokeErr) {
          console.error("Failed to revoke invitation:", revokeErr);
          // Continue anyway - we'll try to create a new one
        }
      }

      await clerk.organizations.createOrganizationInvitation({
        organizationId: data.clerkOrgId,
        emailAddress: data.email,
        role: clerkRole,
        inviterUserId: userId,
      });

      console.log(`Sent invitation to ${data.email}`);
      return {
        success: true,
        message: `Invitation sent to ${data.email}. They will appear here once they accept.`,
        invited: true,
      };
    }
  } catch (error: any) {
    console.error("Failed to add user to organization:", error);

    let errorMessage = error.message || "Failed to add user";
    if (error.errors && Array.isArray(error.errors)) {
      const clerkErrors = error.errors.map((e: any) => e.message || e.longMessage || e.code).join(", ");
      if (clerkErrors) {
        errorMessage = clerkErrors;
      }
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Remove a user from an organization via Clerk.
 */
export async function removeUserFromOrganization(clerkOrgId: string, clerkUserId: string) {
  try {
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
