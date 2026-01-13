"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OnboardingWizard } from "./components/OnboardingWizard";

export default function OnboardingPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const router = useRouter();

  const onboardingStatus = useQuery(
    api.organizations.getOnboardingStatus,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Redirect to dashboard if onboarding is already complete
  useEffect(() => {
    if (onboardingStatus && !onboardingStatus.needsOnboarding) {
      router.push("/dashboard");
    }
  }, [onboardingStatus, router]);

  if (!orgLoaded || onboardingStatus === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">No Organization</h1>
          <p className="text-muted-foreground">
            Please select or create an organization to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <OnboardingWizard
      organizationName={organization.name || "Your Organization"}
      currentStep={onboardingStatus?.currentStep ?? 0}
    />
  );
}
