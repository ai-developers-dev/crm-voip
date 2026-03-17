import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { getStripeClient } from "@/lib/stripe/client";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret!);
  } catch (err: any) {
    console.error("[stripe-webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orgId =
          session.metadata?.organizationId;
        if (orgId && session.subscription) {
          await convex.mutation(api.billing.updateSubscription, {
            organizationId: orgId as Id<"organizations">,
            stripeSubscriptionId: session.subscription as string,
            subscriptionStatus: "trialing",
          });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as any;
        const sub = invoice.subscription as string | null;
        if (sub) {
          // Find org by subscription ID
          const subscription = await stripe.subscriptions.retrieve(sub);
          const orgId = subscription.metadata?.organizationId;
          if (orgId) {
            await convex.mutation(api.billing.updateSubscription, {
              organizationId: orgId as Id<"organizations">,
              stripeSubscriptionId: sub,
              subscriptionStatus: "active",
              currentPeriodEnd: (subscription as any).current_period_end * 1000,
            });
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const sub = invoice.subscription as string | null;
        if (sub) {
          const subscription = await stripe.subscriptions.retrieve(sub);
          const orgId = subscription.metadata?.organizationId;
          if (orgId) {
            await convex.mutation(api.billing.updateSubscription, {
              organizationId: orgId as Id<"organizations">,
              subscriptionStatus: "past_due",
            });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const orgId = subscription.metadata?.organizationId;
        if (orgId) {
          await convex.mutation(api.billing.updateSubscription, {
            organizationId: orgId as Id<"organizations">,
            subscriptionStatus: "canceled",
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error("[stripe-webhook] Error processing event:", err);
  }

  return NextResponse.json({ received: true });
}
