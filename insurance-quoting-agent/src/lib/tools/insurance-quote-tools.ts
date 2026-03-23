import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { runNatGenAutoQuote, runNatGenHomeQuote } from "@/lib/portals/natgen-portal";
import type { InsuranceLeadData, PortalCredentials } from "@/lib/portals/natgen-portal";

// ── Portal driver registry ─────────────────────────────────────────

const PORTAL_DRIVERS: Record<
  string,
  {
    auto?: (creds: PortalCredentials, lead: InsuranceLeadData) => Promise<any>;
    home?: (creds: PortalCredentials, lead: InsuranceLeadData) => Promise<any>;
    label: string;
  }
> = {
  natgen: {
    label: "National General",
    auto: runNatGenAutoQuote,
    home: runNatGenHomeQuote,
  },
  // Add more portals here as new drivers are created:
  // progressive: { label: "Progressive", auto: runProgressiveAutoQuote, home: runProgressiveHomeQuote },
};

export function getAvailablePortals() {
  return Object.entries(PORTAL_DRIVERS).map(([id, cfg]) => ({ id, label: cfg.label }));
}

// ── Get Unquoted Leads ────────────────────────────────────────────

export function createGetUnquotedLeadsTool(config: {
  organizationId: string;
  convex: ConvexHttpClient;
}) {
  const { organizationId, convex } = config;

  return tool({
    description: "Fetch insurance leads that have not yet been quoted for a given portal and insurance type. Returns lead details needed to run the quote.",
    parameters: z.object({
      portal: z.string().describe("Portal identifier: 'natgen', 'progressive', etc."),
      type: z.enum(["auto", "home"]).describe("Type of insurance quote to run"),
      limit: z.number().min(1).max(50).default(10).describe("Max leads to return (default 10)"),
    }),
    execute: async ({ portal, type, limit }) => {
      try {
        const leads = await convex.query(api.insuranceLeads.getUnquoted, {
          organizationId: organizationId as Id<"organizations">,
          portal,
          type,
          limit,
        });
        return { leads, count: leads.length };
      } catch (err: any) {
        return { leads: [], count: 0, error: err?.message ?? String(err) };
      }
    },
  });
}

// ── Quote Insurance Lead ──────────────────────────────────────────

export function createInsuranceQuoteTool(config: {
  credentials: PortalCredentials;
  portal: string;
  organizationId: string;
  convex: ConvexHttpClient;
  notificationEmail?: string;
  notificationPassword?: string;
}) {
  const { credentials, portal, organizationId, convex, notificationEmail, notificationPassword } = config;
  const driver = PORTAL_DRIVERS[portal];

  return tool({
    description: `Run an insurance quote for a lead through the ${driver?.label ?? portal} portal. Fills in the quoting form via browser automation and saves the result to the database.`,
    parameters: z.object({
      leadId: z.string().describe("The _id of the insuranceLeads record to quote"),
      quoteType: z.enum(["auto", "home"]).describe("Type of insurance to quote"),
    }),
    execute: async ({ leadId, quoteType }) => {
      // Mark as quoting
      try {
        await convex.mutation(api.insuranceLeads.updateStatus, {
          id: leadId as Id<"insuranceLeads">,
          status: "quoting",
        });
      } catch { /* non-fatal */ }

      // Load full lead record
      let lead: any;
      try {
        lead = await convex.query(api.insuranceLeads.getById, {
          id: leadId as Id<"insuranceLeads">,
        });
      } catch (err: any) {
        return { success: false, leadId, error: `Failed to load lead: ${err?.message}` };
      }

      if (!lead) {
        return { success: false, leadId, error: "Lead not found" };
      }

      if (!driver) {
        return { success: false, leadId, error: `No driver found for portal: ${portal}` };
      }

      const driverFn = quoteType === "auto" ? driver.auto : driver.home;
      if (!driverFn) {
        return { success: false, leadId, error: `Portal '${portal}' does not support ${quoteType} quotes` };
      }

      // Run the portal automation
      const leadData: InsuranceLeadData = {
        firstName: lead.firstName,
        lastName: lead.lastName,
        dob: lead.dob,
        gender: lead.gender,
        maritalStatus: lead.maritalStatus,
        street: lead.street,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        property: lead.property,
      };

      const result = await driverFn(credentials, leadData);

      // Save quote to DB
      try {
        await convex.mutation(api.quotes.create, {
          organizationId: organizationId as Id<"organizations">,
          insuranceLeadId: leadId as Id<"insuranceLeads">,
          portal,
          type: quoteType,
          status: result.success ? "success" : "error",
          carrier: result.carrier,
          quoteId: result.quoteId,
          monthlyPremium: result.monthlyPremium,
          annualPremium: result.annualPremium,
          coverageDetails: result.coverageDetails,
          errorMessage: result.error,
        });
      } catch (err: any) {
        console.error("[insurance-quote-tools] Failed to save quote:", err);
      }

      // Update lead status
      try {
        await convex.mutation(api.insuranceLeads.updateStatus, {
          id: leadId as Id<"insuranceLeads">,
          status: result.success ? "quoted" : "error",
        });
      } catch { /* non-fatal */ }

      // Send notification email if configured
      if (notificationEmail && notificationPassword && result.success) {
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.default.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: { user: notificationEmail, pass: notificationPassword },
          });

          const leadName = `${lead.firstName} ${lead.lastName}`;
          const premiumStr = result.monthlyPremium
            ? `$${result.monthlyPremium.toFixed(2)}/mo ($${result.annualPremium?.toFixed(2)}/yr)`
            : result.annualPremium
            ? `$${result.annualPremium.toFixed(2)}/yr`
            : "See portal for details";

          await transporter.sendMail({
            from: notificationEmail,
            to: notificationEmail,
            subject: `Quote ready: ${leadName} — ${driver.label} ${quoteType}`,
            html: `
              <h2>Insurance Quote Result</h2>
              <table style="border-collapse:collapse;width:100%;max-width:500px">
                <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Lead</td><td style="padding:6px 12px">${leadName}</td></tr>
                <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Carrier</td><td style="padding:6px 12px">${result.carrier ?? portal}</td></tr>
                <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Type</td><td style="padding:6px 12px">${quoteType.charAt(0).toUpperCase() + quoteType.slice(1)}</td></tr>
                <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Quote #</td><td style="padding:6px 12px">${result.quoteId ?? "—"}</td></tr>
                <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:bold">Premium</td><td style="padding:6px 12px;color:#16a34a;font-size:1.1em">${premiumStr}</td></tr>
              </table>
              <p style="margin-top:16px;font-size:0.85em;color:#666">Generated by Insurance Quoting Agent</p>
            `,
          });
        } catch (emailErr) {
          console.error("[insurance-quote-tools] Failed to send notification email:", emailErr);
        }
      }

      return {
        success: result.success,
        leadId,
        leadName: `${lead.firstName} ${lead.lastName}`,
        portal,
        quoteType,
        carrier: result.carrier,
        quoteId: result.quoteId,
        monthlyPremium: result.monthlyPremium,
        annualPremium: result.annualPremium,
        error: result.error,
      };
    },
  });
}
