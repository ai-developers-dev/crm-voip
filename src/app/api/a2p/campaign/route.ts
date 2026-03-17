import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import {
  createMessagingService,
  addNumberToService,
  registerCampaign,
  getCampaignStatus,
} from "@/lib/twilio/a2p-registration";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/a2p/campaign — Submit a campaign registration
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
      brandId,
      useCase,
      description,
      sampleMessages,
      messageFlow,
      helpMessage,
      optInMessage,
      optOutMessage,
      hasEmbeddedLinks,
      hasEmbeddedPhone,
      isAgeGated,
    } = body;

    if (!organizationId || !brandId || !useCase || !description || !sampleMessages || !messageFlow) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the brand is approved
    const brand = await convex.query(api.a2pBrands.getByOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });
    if (!brand || brand.status !== "approved") {
      return NextResponse.json(
        { error: "Brand must be approved before registering a campaign" },
        { status: 400 }
      );
    }
    if (!brand.brandRegistrationSid) {
      return NextResponse.json(
        { error: "Brand registration SID is missing" },
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
    const authTokenDecrypted = decrypt(twilioCredentials.authToken, organizationId);

    // Step 1: Create a Messaging Service
    const { serviceSid } = await createMessagingService(
      accountSid,
      authTokenDecrypted,
      `${org.name} A2P Messaging`
    );

    // Step 2: Add phone numbers to the Messaging Service
    const phoneNumbers = await convex.query(api.phoneNumbers.getByOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });

    const smsCapableNumbers = phoneNumbers.filter(
      (pn: any) => pn.isActive && pn.capabilities?.sms !== false
    );

    const phoneNumberIds: Id<"phoneNumbers">[] = [];
    for (const pn of smsCapableNumbers) {
      try {
        await addNumberToService(accountSid, authTokenDecrypted, serviceSid, pn.twilioSid);
        phoneNumberIds.push(pn._id);
      } catch (err) {
        console.warn(`[a2p/campaign] Failed to add number ${pn.phoneNumber} to service:`, err);
        // Continue with other numbers
      }
    }

    if (phoneNumberIds.length === 0) {
      return NextResponse.json(
        { error: "No phone numbers could be added to the messaging service" },
        { status: 400 }
      );
    }

    // Step 3: Register the campaign
    const { campaignSid } = await registerCampaign(
      accountSid,
      authTokenDecrypted,
      serviceSid,
      {
        brandRegistrationSid: brand.brandRegistrationSid,
        useCase,
        description,
        sampleMessages,
        messageFlow,
        helpMessage: helpMessage || "Reply HELP for assistance.",
        optInMessage: optInMessage || "You have opted in to receive messages. Reply STOP to opt out.",
        optOutMessage: optOutMessage || "You have been opted out and will not receive further messages. Reply START to opt back in.",
        hasEmbeddedLinks: hasEmbeddedLinks ?? false,
        hasEmbeddedPhone: hasEmbeddedPhone ?? false,
      }
    );

    // Step 4: Save campaign to Convex
    const campaignId = await convex.mutation(api.a2pCampaigns.create, {
      organizationId: organizationId as Id<"organizations">,
      brandId: brandId as Id<"a2pBrands">,
      messagingServiceSid: serviceSid,
      campaignSid,
      useCase,
      description,
      sampleMessages,
      messageFlow,
      helpMessage: helpMessage || "Reply HELP for assistance.",
      optInMessage: optInMessage || "You have opted in to receive messages. Reply STOP to opt out.",
      optOutMessage: optOutMessage || "You have been opted out and will not receive further messages. Reply START to opt back in.",
      hasEmbeddedLinks: hasEmbeddedLinks ?? false,
      hasEmbeddedPhone: hasEmbeddedPhone ?? false,
      isAgeGated,
      phoneNumberIds,
      status: "pending",
    });

    // Update org A2P status
    await convex.mutation(api.organizations.updateSettings, {
      organizationId: organizationId as Id<"organizations">,
      settings: { a2pStatus: "campaign_pending" } as any,
    });

    return NextResponse.json({
      campaignId,
      campaignSid,
      messagingServiceSid: serviceSid,
      status: "pending",
    });
  } catch (err: any) {
    console.error("[a2p/campaign] POST error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to register campaign" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/a2p/campaign?organizationId=xxx — Check campaign status
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

    // Get campaigns from Convex
    const campaigns = await convex.query(api.a2pCampaigns.getByOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ campaigns: [], status: "none" });
    }

    // Check pending campaigns against Twilio
    const pendingCampaigns = campaigns.filter((c) => c.status === "pending");

    if (pendingCampaigns.length > 0) {
      const org = await convex.query(api.organizations.getById, {
        organizationId: organizationId as Id<"organizations">,
      });
      const twilioCredentials = org?.settings?.twilioCredentials;

      if (twilioCredentials?.isConfigured) {
        const accountSid = twilioCredentials.accountSid;
        const authTokenDecrypted = decrypt(twilioCredentials.authToken, organizationId);

        for (const campaign of pendingCampaigns) {
          if (!campaign.messagingServiceSid || !campaign.campaignSid) continue;

          try {
            const twilioStatus = await getCampaignStatus(
              accountSid,
              authTokenDecrypted,
              campaign.messagingServiceSid,
              campaign.campaignSid
            );

            let newStatus = campaign.status;
            if (twilioStatus.status === "APPROVED" || twilioStatus.status === "VERIFIED") {
              newStatus = "approved";
            } else if (twilioStatus.status === "FAILED" || twilioStatus.status === "REJECTED") {
              newStatus = "failed";
            }

            if (newStatus !== campaign.status) {
              await convex.mutation(api.a2pCampaigns.update, {
                campaignId: campaign._id,
                status: newStatus,
                approvedThroughput: twilioStatus.throughput ?? undefined,
                failureReason: twilioStatus.failureReason ?? undefined,
              });

              // If approved, save the messaging service SID to org settings
              if (newStatus === "approved" && campaign.messagingServiceSid) {
                await convex.mutation(api.organizations.updateSettings, {
                  organizationId: organizationId as Id<"organizations">,
                  settings: {
                    a2pMessagingServiceSid: campaign.messagingServiceSid,
                    a2pStatus: "campaign_approved",
                  } as any,
                });
              }

              // Update the campaign in our local array for response
              campaign.status = newStatus;
            }
          } catch (err) {
            console.warn(`[a2p/campaign] Failed to check status for campaign ${campaign._id}:`, err);
          }
        }
      }
    }

    return NextResponse.json({
      campaigns,
      status: campaigns.some((c) => c.status === "approved")
        ? "approved"
        : campaigns.some((c) => c.status === "pending")
          ? "pending"
          : campaigns.every((c) => c.status === "failed")
            ? "failed"
            : "none",
    });
  } catch (err: any) {
    console.error("[a2p/campaign] GET error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to check campaign status" },
      { status: 500 }
    );
  }
}
