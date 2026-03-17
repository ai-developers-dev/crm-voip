import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { getStripeClient } from "@/lib/stripe/client";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { organizationId } = body;

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
    // Save customer ID
    await convex.mutation(api.billing.updateStripeCustomer, {
      organizationId: organizationId as Id<"organizations">,
      stripeCustomerId: customerId,
    });
  }

  // Create Checkout Session with 14-day trial
  const basePlanPrice = org.billing?.basePlanPrice || 97;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `CRM Platform - ${org.name}` },
          unit_amount: basePlanPrice * 100, // cents
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: 14,
      metadata: { organizationId },
    },
    success_url: `${appUrl}/onboarding?step=7&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/onboarding?step=6`,
  });

  return NextResponse.json({ url: session.url });
}
