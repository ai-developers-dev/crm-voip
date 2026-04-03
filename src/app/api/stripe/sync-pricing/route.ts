import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";
import { getStripeClient } from "@/lib/stripe/client";
import type { Id } from "../../../../../convex/_generated/dataModel";


export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stripe = getStripeClient();

    // Get current plan and add-ons from Convex
    const plan = await convex.query(api.pricing.getActivePlan, {});
    const addons = await convex.query(api.pricing.getAllAddons, {});

    if (!plan) {
      return NextResponse.json({ error: "No active pricing plan found" }, { status: 400 });
    }

    const results: { plan: any; addons: any[] } = { plan: null, addons: [] };

    // ── Sync Base Plan ──────────────────────────────────────────────
    let productId = plan.stripeProductId;

    if (productId) {
      // Update existing product
      await stripe.products.update(productId, {
        name: `CRM Platform - ${plan.name}`,
        description: plan.description || `${plan.name} plan`,
      });
    } else {
      // Create new product
      const product = await stripe.products.create({
        name: `CRM Platform - ${plan.name}`,
        description: plan.description || `${plan.name} plan`,
        metadata: { type: "base_plan" },
      });
      productId = product.id;
    }

    // Create base price (always create new — Stripe prices are immutable)
    const basePrice = await stripe.prices.create({
      product: productId,
      unit_amount: Math.round(plan.basePriceMonthly * 100),
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { type: "base_plan" },
    });

    // Create per-user price
    const perUserPrice = await stripe.prices.create({
      product: productId,
      unit_amount: Math.round(plan.perUserPrice * 100),
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { type: "per_user" },
    });

    // Deactivate old prices if they exist
    if (plan.stripeBasePriceId) {
      await stripe.prices.update(plan.stripeBasePriceId, { active: false }).catch(() => {});
    }
    if (plan.stripePerUserPriceId) {
      await stripe.prices.update(plan.stripePerUserPriceId, { active: false }).catch(() => {});
    }

    // Save Stripe IDs to Convex
    await convex.mutation(api.pricing.updatePlanStripeIds, {
      planId: plan._id,
      stripeProductId: productId,
      stripeBasePriceId: basePrice.id,
      stripePerUserPriceId: perUserPrice.id,
    });

    results.plan = {
      productId,
      basePriceId: basePrice.id,
      perUserPriceId: perUserPrice.id,
    };

    // ── Sync Add-Ons ────────────────────────────────────────────────
    for (const addon of addons) {
      if (!addon.isActive) continue;
      if (addon.isIncludedInBase && addon.priceMonthly === 0) continue; // Skip free included items

      let addonProductId = addon.stripeProductId;

      if (addonProductId) {
        await stripe.products.update(addonProductId, {
          name: `Add-On: ${addon.name}`,
          description: addon.description || addon.name,
        });
      } else {
        const product = await stripe.products.create({
          name: `Add-On: ${addon.name}`,
          description: addon.description || addon.name,
          metadata: { type: "addon", featureKey: addon.featureKey },
        });
        addonProductId = product.id;
      }

      // Create new price
      const price = await stripe.prices.create({
        product: addonProductId,
        unit_amount: Math.round(addon.priceMonthly * 100),
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { type: "addon", featureKey: addon.featureKey },
      });

      // Deactivate old price
      if (addon.stripePriceId) {
        await stripe.prices.update(addon.stripePriceId, { active: false }).catch(() => {});
      }

      // Save to Convex
      await convex.mutation(api.pricing.updateAddonStripeIds, {
        addonId: addon._id,
        stripeProductId: addonProductId,
        stripePriceId: price.id,
      });

      results.addons.push({
        name: addon.name,
        productId: addonProductId,
        priceId: price.id,
      });
    }

    return NextResponse.json({
      success: true,
      synced: results,
    });
  } catch (error: any) {
    console.error("Stripe sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
