import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import { getStripeClient } from "@/lib/stripe/client";
import type { Id } from "../../../../../convex/_generated/dataModel";


/**
 * Generate and send usage invoices for all active tenants.
 * Call monthly (via cron or manual trigger from admin dashboard).
 *
 * POST /api/stripe/usage-invoice
 * Body: { month: 0-11, year: 2026 } (defaults to previous month)
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const stripe = getStripeClient();

    // Default to previous month
    const now = new Date();
    const targetMonth = body.month ?? (now.getMonth() === 0 ? 11 : now.getMonth() - 1);
    const targetYear = body.year ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());

    // Get platform org for markup percentages
    const platformOrg = await convex.query(api.organizations.getPlatformOrg, {});
    const twilioMarkup = (platformOrg?.settings as any)?.twilioMarkupPercent ?? 50;
    const retellMarkup = (platformOrg?.settings as any)?.retellMarkupPercent ?? 50;
    const openaiMarkup = (platformOrg?.settings as any)?.openaiMarkupPercent ?? 50;

    // Get all tenant organizations
    const allOrgs = await convex.query(api.organizations.getAllTenants, {});
    const activeOrgs = allOrgs.filter((org: any) => {
      const billing = org.billing as any;
      return billing?.stripeCustomerId && (billing?.subscriptionStatus === "active" || billing?.subscriptionStatus === "trialing");
    });

    const results: any[] = [];

    for (const org of activeOrgs) {
      try {
        const billing = org.billing as any;
        if (!billing?.stripeCustomerId) continue;

        // Get monthly usage totals
        const usage = await convex.query(api.dailyUsage.getMonthlyTotals, {
          organizationId: org._id as Id<"organizations">,
          year: targetYear,
          month: targetMonth,
        });

        // Get AI call costs for the month
        // TODO: Query aiCallHistory for retell costs once populated
        const retellCostCents = 0; // Placeholder until Retell cost tracking is active
        const retellCallCount = 0;
        const retellCallMinutes = 0;

        // Get OpenAI costs for the month
        // TODO: Query smsAgentConversations for token usage once populated
        const openaiCostCents = 0;
        const openaiConversations = 0;
        const openaiTokensUsed = 0;

        // Estimate Twilio costs (rough: $0.013/min calls, $0.0079/SMS)
        const twilioCostCents = Math.ceil(
          usage.totalCallMinutes * 1.3 + // $0.013/min
          usage.totalSms * 0.79           // $0.0079/SMS
        );

        // Skip if no usage
        if (twilioCostCents === 0 && retellCostCents === 0 && openaiCostCents === 0) {
          results.push({ org: org.name, skipped: true, reason: "No usage" });
          continue;
        }

        // Create invoice record in Convex
        const invoiceId = await convex.mutation(api.usageInvoices.create, {
          organizationId: org._id as Id<"organizations">,
          month: targetMonth,
          year: targetYear,
          twilioCallMinutes: usage.totalCallMinutes,
          twilioSmsSent: usage.totalSms,
          twilioCostCents,
          twilioMarkupPercent: twilioMarkup,
          retellCallCount,
          retellCallMinutes,
          retellCostCents,
          retellMarkupPercent: retellMarkup,
          openaiConversations,
          openaiTokensUsed,
          openaiCostCents,
          openaiMarkupPercent: openaiMarkup,
        });

        // Get the created invoice to read charged amounts
        const invoice = await convex.query(api.usageInvoices.getByOrganization, {
          organizationId: org._id as Id<"organizations">,
        });
        const latest = invoice[0]; // Most recent

        if (!latest || latest.totalChargedCents === 0) {
          results.push({ org: org.name, skipped: true, reason: "Zero total" });
          continue;
        }

        // Create Stripe invoice
        const stripeInvoice = await stripe.invoices.create({
          customer: billing.stripeCustomerId,
          auto_advance: true,
          collection_method: "charge_automatically",
          metadata: {
            type: "usage_invoice",
            usageInvoiceId: invoiceId,
            month: String(targetMonth),
            year: String(targetYear),
          },
        });

        // Add line items
        const monthName = new Date(targetYear, targetMonth).toLocaleString("default", { month: "long" });

        if (latest.twilioChargedCents > 0) {
          await stripe.invoiceItems.create({
            customer: billing.stripeCustomerId,
            invoice: stripeInvoice.id,
            amount: latest.twilioChargedCents,
            currency: "usd",
            description: `${monthName} — Twilio Usage: ${usage.totalCallMinutes} min calls, ${usage.totalSms} SMS`,
          });
        }

        if (latest.retellChargedCents > 0) {
          await stripe.invoiceItems.create({
            customer: billing.stripeCustomerId,
            invoice: stripeInvoice.id,
            amount: latest.retellChargedCents,
            currency: "usd",
            description: `${monthName} — AI Voice Agent Usage: ${retellCallCount} calls`,
          });
        }

        if (latest.openaiChargedCents > 0) {
          await stripe.invoiceItems.create({
            customer: billing.stripeCustomerId,
            invoice: stripeInvoice.id,
            amount: latest.openaiChargedCents,
            currency: "usd",
            description: `${monthName} — AI SMS Agent Usage: ${openaiConversations} conversations`,
          });
        }

        // Finalize the invoice (triggers payment)
        await stripe.invoices.finalizeInvoice(stripeInvoice.id);

        // Update our record with Stripe invoice ID
        await convex.mutation(api.usageInvoices.updateStripeInfo, {
          invoiceId: invoiceId as Id<"usageInvoices">,
          stripeInvoiceId: stripeInvoice.id,
          status: "sent",
        });

        results.push({
          org: org.name,
          invoiceId,
          stripeInvoiceId: stripeInvoice.id,
          totalChargedCents: latest.totalChargedCents,
        });
      } catch (err: any) {
        results.push({ org: org.name, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      month: targetMonth,
      year: targetYear,
      processed: results.length,
      results,
    });
  } catch (error: any) {
    console.error("Usage invoice generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
