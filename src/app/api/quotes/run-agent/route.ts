import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import { runNatGenAutoQuote, runNatGenHomeQuote } from "@/lib/portals/natgen-portal";
import type { InsuranceLeadData, PortalCredentials } from "@/lib/portals/natgen-portal";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const maxDuration = 300; // 5 min for multiple leads

async function getAuthenticatedConvex() {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  try {
    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    if (token) convex.setAuth(token);
  } catch {}
  return convex;
}

// Map carrier names to portal driver keys
function getPortalKey(carrierName: string): string | null {
  const name = carrierName.toLowerCase();
  if (name.includes("national general") || name.includes("natgen")) return "natgen";
  // Add more as portal drivers are created:
  // if (name.includes("progressive")) return "progressive";
  // if (name.includes("travelers")) return "travelers";
  return null;
}

// Portal driver registry
const PORTAL_DRIVERS: Record<string, {
  auto: (creds: PortalCredentials, lead: InsuranceLeadData) => Promise<any>;
  home: (creds: PortalCredentials, lead: InsuranceLeadData) => Promise<any>;
}> = {
  natgen: { auto: runNatGenAutoQuote, home: runNatGenHomeQuote },
};

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = await getAuthenticatedConvex();

    const body = await req.json();
    const { organizationId, quoteType = "auto" } = body;

    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
    }

    // Get carriers with portal credentials from tenantCarriers
    const configuredCarriers = await convex.query(api.tenantCommissions.getCarriersWithCredentials, {
      organizationId: organizationId as Id<"organizations">,
    });

    if (configuredCarriers.length === 0) {
      return NextResponse.json({ error: "No carrier portal credentials configured. Add credentials in Carrier Settings." }, { status: 400 });
    }

    // Decrypt credentials and match to portal drivers
    const carriersToRun: Array<{
      carrierId: string;
      carrierName: string;
      portalKey: string;
      credentials: PortalCredentials;
    }> = [];

    for (const tc of configuredCarriers) {
      const portalKey = getPortalKey(tc.carrierName);
      if (!portalKey || !PORTAL_DRIVERS[portalKey]) continue;

      try {
        carriersToRun.push({
          carrierId: tc.carrierId,
          carrierName: tc.carrierName,
          portalKey,
          credentials: {
            username: decrypt(tc.portalUsername, organizationId),
            password: decrypt(tc.portalPassword, organizationId),
            portalUrl: tc.portalUrl || undefined,
          },
        });
      } catch {
        console.error(`[run-agent] Failed to decrypt credentials for ${tc.carrierName}`);
      }
    }

    if (carriersToRun.length === 0) {
      return NextResponse.json({ error: "No supported portal drivers found for configured carriers" }, { status: 400 });
    }

    // Get unquoted leads for the first available portal
    const primaryPortal = carriersToRun[0];
    const leads = await convex.query(api.insuranceLeads.getUnquoted, {
      organizationId: organizationId as Id<"organizations">,
      portal: primaryPortal.portalKey,
      type: quoteType,
      limit: 20,
    });

    if (leads.length === 0) {
      return NextResponse.json({ total: 0, succeeded: 0, failed: 0, message: "No unquoted leads found" });
    }

    // Create agent run for progress tracking
    const runId = await convex.mutation(api.agentRuns.create, {
      organizationId: organizationId as Id<"organizations">,
      type: "insurance_quoting",
      total: leads.length,
    });

    // Return immediately — fire-and-forget. Processing continues below.
    // Vercel keeps the request alive for maxDuration (300s).
    // Progress updates go to Convex in real-time via agentRuns mutations.
    const response = NextResponse.json({ runId, total: leads.length, status: "started" });

    // Process leads in background (after response is sent)
    processLeads(convex, organizationId, runId, leads, carriersToRun, quoteType).catch((err) => {
      console.error("[run-agent] Background processing error:", err);
    });

    return response;
  } catch (err: any) {
    console.error("[quotes/run-agent]", err);
    return NextResponse.json({ error: err.message ?? "Agent run failed" }, { status: 500 });
  }
}

async function processLeads(
  convex: ConvexHttpClient,
  organizationId: string,
  runId: Id<"agentRuns">,
  leads: any[],
  carriers: Array<{ carrierId: string; carrierName: string; portalKey: string; credentials: PortalCredentials }>,
  quoteType: string,
) {
  let succeeded = 0;
  let failed = 0;
  const primaryCarrier = carriers[0];
  const driver = PORTAL_DRIVERS[primaryCarrier.portalKey];

  for (const lead of leads) {
    const leadName = `${lead.firstName} ${lead.lastName}`;

    // Update progress
    await convex.mutation(api.agentRuns.updateProgress, {
      id: runId,
      succeeded,
      failed,
      currentLeadName: leadName,
    });

    // Set lead status to quoting
    await convex.mutation(api.insuranceLeads.updateStatus, {
      id: lead._id,
      status: "quoting",
    });

    const leadData: InsuranceLeadData = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      dob: lead.dob,
      gender: lead.gender ?? undefined,
      maritalStatus: lead.maritalStatus ?? undefined,
      street: lead.street,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      property: lead.property ?? undefined,
    };

    try {
      const quoteFn = quoteType === "home" ? driver.home : driver.auto;
      const result = await quoteFn(primaryCarrier.credentials, leadData);

      if (result.success) {
        await convex.mutation(api.insuranceQuotes.create, {
          organizationId: organizationId as Id<"organizations">,
          insuranceLeadId: lead._id,
          portal: primaryCarrier.portalKey,
          type: quoteType,
          status: "success",
          carrier: result.carrier || primaryCarrier.carrierName,
          quoteId: result.quoteId,
          monthlyPremium: result.monthlyPremium,
          annualPremium: result.annualPremium,
          coverageDetails: result.coverageDetails,
        });
        await convex.mutation(api.insuranceLeads.updateStatus, { id: lead._id, status: "quoted" });
        succeeded++;
      } else {
        await convex.mutation(api.insuranceQuotes.create, {
          organizationId: organizationId as Id<"organizations">,
          insuranceLeadId: lead._id,
          portal: primaryCarrier.portalKey,
          type: quoteType,
          status: "error",
          errorMessage: result.error,
        });
        await convex.mutation(api.insuranceLeads.updateStatus, { id: lead._id, status: "error" });
        failed++;
      }
    } catch (err: any) {
      await convex.mutation(api.insuranceQuotes.create, {
        organizationId: organizationId as Id<"organizations">,
        insuranceLeadId: lead._id,
        portal: primaryCarrier.portalKey,
        type: quoteType,
        status: "error",
        errorMessage: err.message ?? "Unknown error",
      });
      await convex.mutation(api.insuranceLeads.updateStatus, { id: lead._id, status: "error" });
      failed++;
    }
  }

  // Complete the run
  await convex.mutation(api.agentRuns.complete, {
    id: runId,
    status: failed === leads.length ? "failed" : "completed",
    succeeded,
    failed,
  });
}
