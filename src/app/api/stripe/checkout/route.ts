import { NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { getStripeClient } from "@/lib/stripe/client";
import type { Id } from "../../../../../convex/_generated/dataModel";
import Stripe from "stripe";


export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { organizationId, selectedAddonIds } = body;

  const org = await convex.query(api.organizations.getById, {
    organizationId: organizationId as Id<"organizations">,
  });
  if (!org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Create or get Stripe customer
  let customerId = org.billing?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: org.billing?.billingEmail || org.businessInfo?.ownerEmail,
      metadata: { organizationId, clerkOrgId: org.clerkOrgId },
    });
    customerId = customer.id;
    await convex.mutation(api.billing.updateStripeCustomer, {
      organizationId: organizationId as Id<"organizations">,
      stripeCustomerId: customerId,
    });
  }

  // Get pricing plan and add-ons from DB
  const plan = await convex.query(api.pricing.getActivePlan, {});
  const allAddons = await convex.query(api.pricing.getActiveAddons, {});

  // Build line items
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  if (plan?.stripeBasePriceId) {
    // Use synced Stripe prices
    lineItems.push({ price: plan.stripeBasePriceId, quantity: 1 });
  } else {
    // Fallback: inline price_data (legacy)
    const basePlanPrice = org.billing?.basePlanPrice || plan?.basePriceMonthly || 97;
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: `CRM Platform - ${org.name}` },
        unit_amount: basePlanPrice * 100,
        recurring: { interval: "month" },
      },
      quantity: 1,
    });
  }

  // Add selected add-ons
  if (selectedAddonIds && Array.isArray(selectedAddonIds)) {
    for (const addonId of selectedAddonIds) {
      const addon = allAddons?.find((a: any) => a._id === addonId);
      if (addon?.stripePriceId) {
        lineItems.push({ price: addon.stripePriceId, quantity: 1 });
      } else if (addon && addon.priceMonthly > 0) {
        // Fallback: inline price
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: { name: `Add-On: ${addon.name}` },
            unit_amount: Math.round(addon.priceMonthly * 100),
            recurring: { interval: "month" },
          },
          quantity: 1,
        });
      }
    }
  }

  const trialDays = plan?.trialDays ?? 14;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: lineItems,
    subscription_data: {
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: { organizationId },
    },
    success_url: `${appUrl}/onboarding?step=7&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/onboarding?step=6`,
  });

  return NextResponse.json({ url: session.url });
}
