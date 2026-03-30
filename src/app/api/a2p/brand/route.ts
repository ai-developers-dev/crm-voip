import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import {
  createCustomerProfile,
  createBusinessEndUser,
  createAuthorizedRep,
  assignEndUser,
  submitCustomerProfile,
  registerBrand,
  getBrandStatus,
} from "@/lib/twilio/a2p-registration";
import type { Id } from "../../../../../convex/_generated/dataModel";


/**
 * POST /api/a2p/brand — Submit a brand registration
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      organizationId,
      legalBusinessName,
      ein,
      businessType,
      businessIndustry,
      websiteUrl,
      street,
      city,
      state,
      zip,
      country,
      contactFirstName,
      contactLastName,
      contactEmail,
      contactPhone,
      contactTitle,
    } = body;

    if (!organizationId || !legalBusinessName || !ein || !contactFirstName || !contactLastName || !contactEmail || !contactPhone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get org and decrypt Twilio credentials
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const twilioCredentials = org.settings?.twilioCredentials;
    if (!twilioCredentials?.isConfigured) {
      return NextResponse.json(
        { error: "Twilio not configured for this organization" },
        { status: 400 }
      );
    }

    const accountSid = twilioCredentials.accountSid;
    const authToken = decrypt(twilioCredentials.authToken, organizationId);

    // Step 1: Create Customer Profile
    const { customerProfileSid } = await createCustomerProfile(
      accountSid,
      authToken,
      {
        friendlyName: `${legalBusinessName} - A2P Profile`,
        email: contactEmail,
      }
    );

    // Step 2: Create Business End User
    const { endUserSid: businessEndUserSid } = await createBusinessEndUser(
      accountSid,
      authToken,
      {
        businessName: legalBusinessName,
        businessType: businessType || "Partnership",
        ein,
        industryType: businessIndustry || "INSURANCE",
        websiteUrl,
        street,
        city,
        state,
        zip,
        country: country || "US",
      }
    );

    // Step 3: Create Authorized Representative
    const { endUserSid: repEndUserSid } = await createAuthorizedRep(
      accountSid,
      authToken,
      {
        firstName: contactFirstName,
        lastName: contactLastName,
        email: contactEmail,
        phone: contactPhone,
        title: contactTitle,
      }
    );

    // Step 4: Assign both end users to the Customer Profile
    await assignEndUser(accountSid, authToken, customerProfileSid, businessEndUserSid);
    await assignEndUser(accountSid, authToken, customerProfileSid, repEndUserSid);

    // Step 5: Submit the Customer Profile for evaluation
    await submitCustomerProfile(accountSid, authToken, customerProfileSid);

    // Step 6: Register the Brand
    const { brandSid } = await registerBrand(accountSid, authToken, customerProfileSid);

    // Step 7: Save brand record to Convex
    const brandId = await convex.mutation(api.a2pBrands.create, {
      organizationId: organizationId as Id<"organizations">,
      customerProfileSid,
      brandRegistrationSid: brandSid,
      legalBusinessName,
      ein,
      businessType: businessType || "Partnership",
      businessIndustry: businessIndustry || "INSURANCE",
      websiteUrl,
      businessAddress: { street, city, state, zip, country: country || "US" },
      contactFirstName,
      contactLastName,
      contactEmail,
      contactPhone,
      contactTitle,
      status: "pending",
    });

    // Update org A2P status
    await convex.mutation(api.organizations.updateSettings, {
      organizationId: organizationId as Id<"organizations">,
      settings: { a2pStatus: "brand_pending" } as any,
    });

    return NextResponse.json({
      brandId,
      brandRegistrationSid: brandSid,
      customerProfileSid,
      status: "pending",
    });
  } catch (err: any) {
    console.error("[a2p/brand] POST error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to register brand" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/a2p/brand?organizationId=xxx — Check brand registration status
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
    }

    // Get brand from Convex
    const brand = await convex.query(api.a2pBrands.getByOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });
    if (!brand) {
      return NextResponse.json({ brand: null, status: "none" });
    }

    // If still pending, poll Twilio for latest status
    if (brand.status === "pending" && brand.brandRegistrationSid) {
      const org = await convex.query(api.organizations.getById, {
        organizationId: organizationId as Id<"organizations">,
      });
      const twilioCredentials = org?.settings?.twilioCredentials;

      if (twilioCredentials?.isConfigured) {
        const accountSid = twilioCredentials.accountSid;
        const authTokenDecrypted = decrypt(twilioCredentials.authToken, organizationId);

        const twilioStatus = await getBrandStatus(
          accountSid,
          authTokenDecrypted,
          brand.brandRegistrationSid
        );

        // Map Twilio status to our status
        let newStatus = brand.status;
        if (twilioStatus.status === "APPROVED") newStatus = "approved";
        else if (twilioStatus.status === "FAILED") newStatus = "failed";

        if (newStatus !== brand.status) {
          await convex.mutation(api.a2pBrands.update, {
            brandId: brand._id,
            status: newStatus,
            vettingScore: twilioStatus.vettingScore ?? undefined,
            failureReason: twilioStatus.failureReason ?? undefined,
          });

          if (newStatus === "approved") {
            await convex.mutation(api.organizations.updateSettings, {
              organizationId: organizationId as Id<"organizations">,
              settings: { a2pStatus: "brand_approved" } as any,
            });
          }

          return NextResponse.json({
            brand: { ...brand, status: newStatus, vettingScore: twilioStatus.vettingScore },
            status: newStatus,
          });
        }
      }
    }

    return NextResponse.json({ brand, status: brand.status });
  } catch (err: any) {
    console.error("[a2p/brand] GET error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to check brand status" },
      { status: 500 }
    );
  }
}
