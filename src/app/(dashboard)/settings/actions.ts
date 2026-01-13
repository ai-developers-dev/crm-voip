"use server";

import { clerkClient, auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

async function getConvexClient() {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

export interface UpdateOwnOrganizationData {
  businessName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  ownerName: string;
  ownerEmail: string;
}

export async function updateOwnOrganization(data: UpdateOwnOrganizationData) {
  try {
    const { orgId, userId } = await auth();

    if (!orgId) {
      return { success: false, error: "No organization selected" };
    }

    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const clerk = await clerkClient();
    const convex = await getConvexClient();

    // Verify user is an admin of this organization
    const membership = await clerk.organizations.getOrganizationMembershipList({
      organizationId: orgId,
    });

    const userMembership = membership.data.find(
      (m) => m.publicUserData?.userId === userId
    );

    if (!userMembership || userMembership.role !== "org:admin") {
      return { success: false, error: "Only organization admins can update organization details" };
    }

    // Update Clerk organization metadata
    await clerk.organizations.updateOrganization(orgId, {
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

    // Update Convex database (business info only - no billing)
    await convex.mutation(api.organizations.updateBusinessInfo, {
      clerkOrgId: orgId,
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
    });

    return {
      success: true,
      message: "Organization details updated successfully",
    };
  } catch (error: any) {
    console.error("Failed to update organization:", error);

    let errorMessage = error.message || "Failed to update organization";
    if (error.errors && Array.isArray(error.errors)) {
      const clerkErrors = error.errors
        .map((e: any) => e.message || e.longMessage || e.code)
        .join(", ");
      if (clerkErrors) {
        errorMessage = clerkErrors;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
