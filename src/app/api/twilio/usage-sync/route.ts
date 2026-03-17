import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

/**
 * Sync Twilio usage records for all auto-provisioned tenants.
 * Called manually or via cron to track per-tenant usage.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get platform org + master Twilio credentials
    const platformOrg = await convex.query(api.organizations.getPlatformOrg);
    const twilioMaster = (platformOrg?.settings as any)?.twilioMaster;
    if (!twilioMaster?.isConfigured) {
      return NextResponse.json({ error: "Master phone system not configured" }, { status: 400 });
    }

    // Get all tenant orgs
    const allTenants = await convex.query(api.organizations.getAllTenants);
    if (!allTenants || allTenants.length === 0) {
      return NextResponse.json({ synced: 0, message: "No tenants found" });
    }

    // Get markup percentage from platform settings
    const markupPercent = (platformOrg?.settings as any)?.twilioMarkupPercent ?? 50;

    const results: Array<{ orgName: string; calls: number; minutes: number; sms: number; twilioCoast: number; markedUpCost: number }> = [];

    for (const tenant of allTenants) {
      const twilioCredentials = tenant.settings?.twilioCredentials;
      if (!twilioCredentials?.isConfigured || !twilioCredentials?.isAutoProvisioned) {
        continue; // Skip tenants not using auto-provisioned subaccounts
      }

      try {
        let authToken: string;
        try {
          authToken = decrypt(twilioCredentials.authToken, tenant._id);
        } catch {
          continue; // Skip if can't decrypt
        }

        // Query Twilio Usage Records for this month
        const twilioAuth = Buffer.from(`${twilioCredentials.accountSid}:${authToken}`).toString("base64");
        const res = await fetch(
          `${TWILIO_API_BASE}/Accounts/${twilioCredentials.accountSid}/Usage/Records/ThisMonth.json`,
          { headers: { Authorization: `Basic ${twilioAuth}` } }
        );

        if (!res.ok) continue;

        const data = await res.json();
        const records = data.usage_records || [];

        // Extract key metrics
        let totalCalls = 0;
        let totalMinutes = 0;
        let totalSms = 0;
        let totalCost = 0;

        for (const record of records) {
          const price = parseFloat(record.price || "0");
          totalCost += price;

          switch (record.category) {
            case "calls":
            case "calls-inbound":
            case "calls-outbound":
              totalCalls += parseInt(record.count || "0");
              totalMinutes += parseFloat(record.usage || "0");
              break;
            case "sms":
            case "sms-inbound":
            case "sms-outbound":
              totalSms += parseInt(record.count || "0");
              break;
          }
        }

        const markedUpCost = Math.round(totalCost * (1 + markupPercent / 100) * 100) / 100;

        results.push({
          orgName: tenant.name,
          calls: totalCalls,
          minutes: Math.round(totalMinutes),
          sms: totalSms,
          twilioCoast: Math.round(totalCost * 100) / 100,
          markedUpCost,
        });
      } catch (err) {
        console.error(`[usage-sync] Failed for ${tenant.name}:`, err);
      }
    }

    return NextResponse.json({
      synced: results.length,
      markupPercent,
      tenants: results,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[usage-sync] Error:", err);
    return NextResponse.json({ error: err.message ?? "Usage sync failed" }, { status: 500 });
  }
}
