"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle, Loader2, Shield } from "lucide-react";

interface PaymentStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function PaymentStep({ onNext, onBack, onSkip }: PaymentStepProps) {
  const { organization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const hasSubscription = convexOrg?.billing?.stripeSubscriptionId;
  const subscriptionStatus = (convexOrg?.billing as any)?.subscriptionStatus;

  // If already subscribed or trialing, show success and continue
  if (hasSubscription && (subscriptionStatus === "active" || subscriptionStatus === "trialing")) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold mb-1">Payment</h2>
          <p className="text-sm text-muted-foreground">Your billing is set up.</p>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {subscriptionStatus === "trialing" ? "14-Day Free Trial Active" : "Subscription Active"}
            </p>
            <p className="text-xs text-muted-foreground">Your card will be charged after the trial period.</p>
          </div>
        </div>
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onNext}>Continue</Button>
        </div>
      </div>
    );
  }

  const handleStartTrial = async () => {
    if (!convexOrg?._id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: convexOrg._id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to create checkout session");
      }
    } catch {
      setError("Network error -- please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Start Your Free Trial</h2>
        <p className="text-sm text-muted-foreground">
          Try the full platform free for 14 days. Your card won&apos;t be charged until the trial ends.
        </p>
      </div>

      {/* Plan summary */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Your Plan</h3>
        <div className="flex items-center justify-between text-sm">
          <span>Base plan</span>
          <span className="font-semibold">${convexOrg?.billing?.basePlanPrice || 97}/mo</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Per additional user</span>
          <span className="font-semibold">${convexOrg?.billing?.perUserPrice || 47}/mo</span>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Included users</span>
          <span>{convexOrg?.billing?.includedUsers || 1}</span>
        </div>
        <div className="border-t pt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>14-day free trial -- cancel anytime</span>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip}>Skip for now</Button>
          <Button onClick={handleStartTrial} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1.5" />}
            Start Free Trial
          </Button>
        </div>
      </div>
    </div>
  );
}
