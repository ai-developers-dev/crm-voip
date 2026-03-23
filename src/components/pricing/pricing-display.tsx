"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CheckCircle2, Plus } from "lucide-react";

export function PricingDisplay() {
  const plan = useQuery(api.pricing.getActivePlan);
  const addons = useQuery(api.pricing.getActiveAddons);

  if (!plan) return null;

  const includedAddons = (addons || []).filter((a) => a.isIncludedInBase);

  // Group paid addons by name (multi-feature groups share the same name)
  const paidAddonMap = new Map<string, { name: string; priceMonthly: number; features: string[] }>();
  for (const addon of (addons || []).filter((a) => !a.isIncludedInBase && a.isActive)) {
    const existing = paidAddonMap.get(addon.name);
    if (existing) {
      existing.features.push(addon.featureKey);
    } else {
      paidAddonMap.set(addon.name, {
        name: addon.name,
        priceMonthly: addon.priceMonthly || 0,
        features: [addon.featureKey],
      });
    }
  }
  const paidGroups = [...paidAddonMap.values()].filter(g => g.priceMonthly > 0);

  return (
    <section className="py-20 bg-muted/30" id="pricing">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Simple, Transparent Pricing</h2>
          <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
            One plan with everything you need. Add features as you grow.
          </p>
        </div>

        <div className="max-w-lg mx-auto">
          <div className="rounded-2xl border-2 border-primary/20 bg-card p-8 shadow-lg">
            {/* Plan header */}
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold">{plan.name}</h3>
              {plan.description && (
                <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
              )}
            </div>

            {/* Price */}
            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold">${plan.basePriceMonthly}</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              {plan.perUserPrice > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  + ${plan.perUserPrice}/month per additional user
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {plan.includedUsers} user{plan.includedUsers !== 1 ? "s" : ""} included
              </p>
            </div>

            {/* Trial badge */}
            {plan.trialDays > 0 && (
              <div className="text-center mb-6">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                  {plan.trialDays}-day free trial
                </span>
              </div>
            )}

            {/* Included features */}
            {includedAddons.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Included</p>
                <ul className="space-y-2">
                  {includedAddons.map((addon) => (
                    <li key={addon._id} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <span>{addon.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Paid add-ons */}
            {paidGroups.length > 0 && (
              <div className="mb-6 border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Available Add-Ons</p>
                <ul className="space-y-2">
                  {paidGroups.map((group) => (
                    <li key={group.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{group.name}</span>
                      </div>
                      <span className="font-semibold text-primary">${group.priceMonthly}/mo</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA */}
            <a
              href="/sign-up"
              className="block w-full rounded-lg bg-primary py-3 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Free Trial
            </a>
            <p className="text-center text-xs text-muted-foreground mt-2">
              No credit card required. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
