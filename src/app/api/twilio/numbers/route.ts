import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import { searchAvailableNumbers, purchasePhoneNumber, releasePhoneNumber } from "@/lib/twilio/provisioning";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Search available phone numbers
export async function GET(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const areaCode = searchParams.get("areaCode") || undefined;
    const contains = searchParams.get("contains") || undefined;
    const type = (searchParams.get("type") as "local" | "tollFree" | "mobile") || "local";
    const country = searchParams.get("country") || "US";

    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
    }

    // Get tenant's Twilio subaccount credentials
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });
    const twilioCredentials = org?.settings?.twilioCredentials;
    if (!twilioCredentials?.isConfigured) {
      return NextResponse.json({ error: "Phone system not configured" }, { status: 400 });
    }

    const authToken = decrypt(twilioCredentials.authToken, organizationId);

    const numbers = await searchAvailableNumbers(
      twilioCredentials.accountSid,
      authToken,
      { country, areaCode, contains, type, limit: 20 }
    );

    return NextResponse.json({ numbers });
  } catch (err: any) {
    console.error("[twilio-numbers] Search error:", err);
    return NextResponse.json({ error: err.message ?? "Failed to search numbers" }, { status: 500 });
  }
}

// Purchase a phone number
export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { organizationId, phoneNumber } = body;

    if (!organizationId || !phoneNumber) {
      return NextResponse.json({ error: "Missing organizationId or phoneNumber" }, { status: 400 });
    }

    // Get tenant's Twilio subaccount credentials
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });
    const twilioCredentials = org?.settings?.twilioCredentials;
    if (!twilioCredentials?.isConfigured) {
      return NextResponse.json({ error: "Phone system not configured" }, { status: 400 });
    }

    const authToken = decrypt(twilioCredentials.authToken, organizationId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Purchase under tenant's subaccount
    const result = await purchasePhoneNumber(
      twilioCredentials.accountSid,
      authToken,
      phoneNumber,
      {
        voiceUrl: `${appUrl}/api/twilio/voice`,
        smsUrl: `${appUrl}/api/twilio/sms`,
      }
    );

    // Save to Convex
    await convex.mutation(api.phoneNumbers.create, {
      organizationId: organizationId as Id<"organizations">,
      phoneNumber: result.phoneNumber,
      twilioSid: result.sid,
      friendlyName: result.friendlyName || result.phoneNumber,
      type: "main",
      routingType: "ring_all",
      voicemailEnabled: false,
      isActive: true,
      monthlyCost: 115, // $1.15 in cents (US local)
      purchasedAt: Date.now(),
      capabilities: { voice: true, sms: true, mms: false },
    });

    return NextResponse.json({ success: true, phoneNumber: result.phoneNumber });
  } catch (err: any) {
    console.error("[twilio-numbers] Purchase error:", err);
    return NextResponse.json({ error: err.message ?? "Failed to purchase number" }, { status: 500 });
  }
}

// Release a phone number
export async function DELETE(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const phoneNumberId = searchParams.get("phoneNumberId");

    if (!organizationId || !phoneNumberId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    // Get phone number record
    const phoneNum = await convex.query(api.phoneNumbers.getById, {
      id: phoneNumberId as Id<"phoneNumbers">,
    });
    if (!phoneNum) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    // Get tenant's Twilio credentials
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });
    const twilioCredentials = org?.settings?.twilioCredentials;
    if (!twilioCredentials?.isConfigured) {
      return NextResponse.json({ error: "Phone system not configured" }, { status: 400 });
    }

    const authToken = decrypt(twilioCredentials.authToken, organizationId);

    // Release from Twilio
    await releasePhoneNumber(twilioCredentials.accountSid, authToken, phoneNum.twilioSid);

    // Remove from Convex
    await convex.mutation(api.phoneNumbers.remove, {
      phoneNumberId: phoneNumberId as Id<"phoneNumbers">,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[twilio-numbers] Release error:", err);
    return NextResponse.json({ error: err.message ?? "Failed to release number" }, { status: 500 });
  }
}
