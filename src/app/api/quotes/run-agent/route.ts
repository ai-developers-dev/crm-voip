import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import {
  runNatGenAutoQuote, runNatGenHomeQuote,
  loginForQuoting, completeQuoting2FA, cleanupQuoteSession,
} from "@/lib/portals/natgen-portal";
import { runQuoteFromMappings } from "@/lib/portals/mapping-driven-runner";
import type { InsuranceLeadData, PortalCredentials, ProgressCallback } from "@/lib/portals/natgen-portal";
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
// Returns "natgen" for hardcoded drivers, or "mappings:{id}" for mapping-driven carriers
async function getPortalKey(
  carrierName: string,
  carrierId: string,
  quoteType: string,
  convex: ConvexHttpClient,
): Promise<string | null> {
  // Check for saved field mappings FIRST — these take priority over hardcoded drivers
  try {
    const mapping = await convex.query(api.portalFieldMappings.getByCarrierAndType, {
      carrierId: carrierId as Id<"agencyCarriers">,
      quoteType,
    });
    if (mapping && mapping.screens?.length > 0) {
      console.log(`[run-agent] Using field mappings for ${carrierName} (${quoteType}): ${mapping._id}`);
      return `mappings:${mapping._id}`;
    }
  } catch {}

  // Fall back to hardcoded drivers
  const name = carrierName.toLowerCase();
  if (name.includes("national general") || name.includes("natgen")) return "natgen";

  return null;
}

// Portal driver registry
const PORTAL_DRIVERS: Record<string, {
  auto: (creds: PortalCredentials, lead: InsuranceLeadData, onProgress?: ProgressCallback, session?: { browser: any; page: any }) => Promise<any>;
  home: (creds: PortalCredentials, lead: InsuranceLeadData, onProgress?: ProgressCallback, session?: { browser: any; page: any }) => Promise<any>;
}> = {
  natgen: { auto: runNatGenAutoQuote, home: runNatGenHomeQuote },
};

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = await getAuthenticatedConvex();

    const body = await req.json();
    const { organizationId, quoteType = "auto", action, sessionId, code } = body;

    // ── 2FA Resume Flow ──────────────────────────────────────────────
    if (action === "resume_2fa" && sessionId && code) {
      const result = await completeQuoting2FA(sessionId, code, convex);
      if (result.status !== "logged_in") {
        return NextResponse.json(result);
      }
      // 2FA complete — now run quotes using the authenticated session
      return await startQuotingWithSession(convex, organizationId, quoteType, result.browser, result.page);
    }

    if (action === "cleanup" && sessionId) {
      cleanupQuoteSession(sessionId);
      return NextResponse.json({ ok: true });
    }

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    // Get carriers with portal credentials from tenantCarriers
    const configuredCarriers = await convex.query(api.tenantCommissions.getCarriersWithCredentials, {
      organizationId: organizationId as Id<"organizations">,
    });

    // Decrypt credentials and match to portal drivers
    const carriersToRun: Array<{
      carrierId: string;
      carrierName: string;
      portalKey: string;
      credentials: PortalCredentials;
    }> = [];

    for (const tc of configuredCarriers) {
      const portalKey = await getPortalKey(tc.carrierName, tc.carrierId, quoteType, convex);
      // Accept hardcoded drivers OR mapping-driven carriers
      if (!portalKey || (!PORTAL_DRIVERS[portalKey] && !portalKey.startsWith("mappings:"))) continue;

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

    // Fallback: check org settings for legacy natgenCredentials
    if (carriersToRun.length === 0) {
      const org = await convex.query(api.organizations.getById, {
        organizationId: organizationId as Id<"organizations">,
      });
      const natgenCreds = (org?.settings as any)?.natgenCredentials;
      if (natgenCreds?.isConfigured && natgenCreds.username && natgenCreds.password) {
        // Try decrypting first (older encrypted format), fallback to plain text
        let username = natgenCreds.username;
        let password = natgenCreds.password;
        try {
          username = decrypt(natgenCreds.username, organizationId);
          password = decrypt(natgenCreds.password, organizationId);
        } catch {
          // Not encrypted — use as-is (plain text from new UI)
          console.log("[run-agent] Using plain text natgenCredentials");
        }
        carriersToRun.push({
          carrierId: "natgen-legacy",
          carrierName: "National General",
          portalKey: "natgen",
          credentials: {
            username,
            password,
            portalUrl: natgenCreds.portalUrl || undefined,
          },
        });
        console.log("[run-agent] Using natgenCredentials from org settings");
      }
    }

    if (carriersToRun.length === 0) {
      return NextResponse.json({
        error: "No carrier portal credentials found. Add NatGen credentials in Admin → Tenant → Settings → Carriers, or test via AI Agents → Insurance Quoting.",
      }, { status: 400 });
    }

    // Single-browser login: attempt login first, handle 2FA if needed
    const primaryCarrier = carriersToRun[0];
    console.log("[run-agent] Starting loginForQuoting...");
    const loginResult = await loginForQuoting(primaryCarrier.credentials, undefined, convex);
    console.log("[run-agent] loginForQuoting result:", loginResult.status);

    if (loginResult.status === "needs_2fa") {
      // Return 2FA prompt — UI will show code input and call resume_2fa
      return NextResponse.json({
        status: "needs_2fa",
        sessionId: loginResult.sessionId,
        message: loginResult.message,
      });
    }

    if (loginResult.status === "error") {
      return NextResponse.json({ error: loginResult.message }, { status: 400 });
    }

    // Login succeeded — start quoting with the authenticated session
    return await startQuotingWithSession(convex, organizationId, quoteType, loginResult.browser, loginResult.page);
  } catch (err: any) {
    console.error("[quotes/run-agent]", err);
    return NextResponse.json({ error: err.message ?? "Agent run failed" }, { status: 500 });
  }
}

async function startQuotingWithSession(
  convex: ConvexHttpClient,
  organizationId: string,
  quoteType: string,
  browser: any,
  page: any,
) {
  // Get carriers and leads
  const configuredCarriers = await convex.query(api.tenantCommissions.getCarriersWithCredentials, {
    organizationId: organizationId as Id<"organizations">,
  });

  const carriersToRun: Array<{
    carrierId: string;
    carrierName: string;
    portalKey: string;
    credentials: PortalCredentials;
  }> = [];

  for (const tc of configuredCarriers) {
    const portalKey = await getPortalKey(tc.carrierName, tc.carrierId, quoteType, convex);
    if (!portalKey || (!PORTAL_DRIVERS[portalKey] && !portalKey.startsWith("mappings:"))) continue;
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

  const primaryCarrier = carriersToRun[0];
  if (!primaryCarrier) {
    await browser.close();
    return NextResponse.json({ error: "No configured carrier found" }, { status: 400 });
  }

  const leads = await convex.query(api.insuranceLeads.getUnquoted, {
    organizationId: organizationId as Id<"organizations">,
    portal: primaryCarrier.portalKey,
    type: quoteType,
    limit: 20,
  });

  if (leads.length === 0) {
    await browser.close();
    return NextResponse.json({ total: 0, succeeded: 0, failed: 0, message: "No unquoted leads found" });
  }

  const runId = await convex.mutation(api.agentRuns.create, {
    organizationId: organizationId as Id<"organizations">,
    type: "insurance_quoting",
    total: leads.length,
  });

  const response = NextResponse.json({ runId, total: leads.length, status: "started" });

  // Pass the authenticated browser session to processLeads
  processLeadsWithSession(convex, organizationId, runId, leads, primaryCarrier, quoteType, browser, page).catch((err) => {
    console.error("[run-agent] Background processing error:", err);
  });

  return response;
}

/**
 * Process leads using a pre-authenticated browser session (single login).
 * The first lead uses the existing session; subsequent leads get fresh browsers.
 */
async function processLeadsWithSession(
  convex: ConvexHttpClient,
  organizationId: string,
  runId: Id<"agentRuns">,
  leads: any[],
  carrier: { carrierId: string; carrierName: string; portalKey: string; credentials: PortalCredentials },
  quoteType: string,
  browser: any,
  page: any,
): Promise<void> {
  let succeeded = 0;
  let failed = 0;
  const driver = PORTAL_DRIVERS[carrier.portalKey];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const leadName = `${lead.firstName} ${lead.lastName}`;

    await convex.mutation(api.agentRuns.updateProgress, {
      id: runId,
      succeeded,
      failed,
      currentLeadName: leadName,
    });

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
      phone: lead.phone ?? undefined,
      email: lead.email ?? undefined,
      street: lead.street,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      property: lead.property ?? undefined,
    };

    try {
      const onProgress: ProgressCallback = async (stage: string) => {
        await convex.mutation(api.agentRuns.updateProgress, {
          id: runId,
          succeeded,
          failed,
          currentLeadName: leadName,
          currentStage: stage,
        });
      };

      // First lead uses the pre-authenticated session; subsequent leads create new browsers
      const session = i === 0 ? { browser, page } : undefined;

      let result: any;
      if (carrier.portalKey.startsWith("mappings:")) {
        // Mapping-driven runner — carrier-agnostic
        const mappingId = carrier.portalKey.split(":")[1];
        result = await runQuoteFromMappings(carrier.credentials, leadData, mappingId, convex, onProgress, session);
        // Normalize result shape
        if (!result.success && !result.error) result.success = !!result.quoteId || !!result.monthlyPremium;
      } else {
        // Hardcoded driver
        const quoteFn = quoteType === "home" ? driver.home : driver.auto;
        result = await quoteFn(carrier.credentials, leadData, onProgress, session);
      }

      if (result.success) {
        await convex.mutation(api.insuranceQuotes.create, {
          organizationId: organizationId as Id<"organizations">,
          insuranceLeadId: lead._id,
          portal: carrier.portalKey,
          type: quoteType,
          status: "success",
          carrier: result.carrier || carrier.carrierName,
          quoteId: result.quoteId,
          monthlyPremium: result.monthlyPremium,
          annualPremium: result.annualPremium,
          coverageDetails: result.coverageDetails,
        });
        await convex.mutation(api.insuranceLeads.updateStatus, { id: lead._id, status: "quoted" });

        // Save captured data (drivers, vehicles, prior insurance) to the contact
        if (result.capturedDrivers?.length || result.capturedVehicles?.length || result.capturedPriorInsurance) {
          try {
            const contacts = await convex.query(api.contacts.getByOrganization, {
              organizationId: organizationId as Id<"organizations">,
            });
            const matchingContact = (contacts as any[])?.find(
              (c: any) => c.firstName === lead.firstName && (c.lastName || "") === (lead.lastName || "")
            );
            if (matchingContact) {
              // Save drivers and vehicles
              if (result.capturedDrivers?.length || result.capturedVehicles?.length) {
                await convex.mutation(api.contacts.updateDriversAndVehicles, {
                  contactId: matchingContact._id,
                  drivers: result.capturedDrivers?.length ? result.capturedDrivers : undefined,
                  vehicles: result.capturedVehicles?.length ? result.capturedVehicles : undefined,
                });
                console.log(`[auto-quote] Saved ${result.capturedDrivers?.length || 0} drivers, ${result.capturedVehicles?.length || 0} vehicles`);
              }
              // Save prior insurance data
              if (result.capturedPriorInsurance) {
                const pi = result.capturedPriorInsurance;
                await convex.mutation(api.contacts.updatePriorInsurance, {
                  contactId: matchingContact._id,
                  priorInsuranceCarrier: pi.priorCarrier || undefined,
                  priorBiCoverage: pi.priorBi || undefined,
                  priorInsuranceExpDate: pi.priorExpDate || undefined,
                  monthsWithRecentCarrier: pi.monthsRecent ? parseInt(pi.monthsRecent) || undefined : undefined,
                });
                console.log(`[auto-quote] Saved prior insurance: carrier=${pi.priorCarrier}, BI=${pi.priorBi}`);
              }
            }
          } catch (e: any) {
            console.log(`[auto-quote] Failed to save captured data: ${e.message?.slice(0, 100)}`);
          }
        }

        succeeded++;
      } else {
        await convex.mutation(api.insuranceQuotes.create, {
          organizationId: organizationId as Id<"organizations">,
          insuranceLeadId: lead._id,
          portal: carrier.portalKey,
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
        portal: carrier.portalKey,
        type: quoteType,
        status: "error",
        errorMessage: err.message ?? "Unknown error",
      });
      await convex.mutation(api.insuranceLeads.updateStatus, { id: lead._id, status: "error" });
      failed++;
    }
  }

  await convex.mutation(api.agentRuns.complete, {
    id: runId,
    status: failed === leads.length ? "failed" : "completed",
    succeeded,
    failed,
  });
}
