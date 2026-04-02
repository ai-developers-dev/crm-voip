import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY not configured");
  stripeClient = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" as any });
  return stripeClient;
}
