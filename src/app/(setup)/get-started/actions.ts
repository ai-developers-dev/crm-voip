"use server";

import { clerkClient, auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { provisionTenant } from "@/lib/twilio/provisioning";
import { encrypt, decryptLegacy } from "@/lib/credentials/crypto";

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

export interface SelfServiceTenantData {
  businessName: string;
  ownerName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  agencyTypeId?: string;
  basePlanPrice: number;
  perUserPrice: number;
  includedUsers: number;
}

export async function createSelfServiceTenant(data: SelfServiceTenantData) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

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
        ownerEmail: data.email,
      },
    });

    // 2. Add current user as org admin (they ARE the owner)
    await clerk.organizations.createOrganizationMembership({
      organizationId: org.id,
      userId: userId,
      role: "org:admin",
    });

    // 3. Create the organization in Convex with full details
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
        ownerEmail: data.email,
      },
      billing: {
        basePlanPrice: data.basePlanPrice,
        perUserPrice: data.perUserPrice,
        includedUsers: data.includedUsers,
        billingEmail: data.email,
      },
      agencyTypeId: data.agencyTypeId as any,
    });

    // 4. Auto-provision Twilio subaccount if master Twilio is configured
    try {
      const platformOrg = await convex.query(api.organizations.getPlatformOrg);
      const twilioMaster = platformOrg?.settings?.twilioMaster;
      if (twilioMaster?.isConfigured && platformOrg) {
        const masterAuth = decryptLegacy(twilioMaster.authToken, platformOrg._id);
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

    return {
      success: true,
      clerkOrgId: org.id,
    };
  } catch (error: any) {
    console.error("Failed to create self-service tenant:", error);

    let errorMessage = error.message || "Failed to create tenant";
    if (error.errors && Array.isArray(error.errors)) {
      const clerkErrors = error.errors
        .map((e: any) => e.message || e.longMessage || e.code)
        .join(", ");
      if (clerkErrors) {
        errorMessage = clerkErrors;
      }
    }

    return { success: false, error: errorMessage };
  }
}
