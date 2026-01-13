"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WelcomeStep } from "./WelcomeStep";
import { TwilioSetupStep } from "./TwilioSetupStep";
import { TeamSetupStep } from "./TeamSetupStep";
import { CallSettingsStep } from "./CallSettingsStep";
import { CompletionStep } from "./CompletionStep";

interface OnboardingWizardProps {
  organizationName: string;
  currentStep: number;
}

const STEPS = [
  { title: "Welcome", description: "Get started" },
  { title: "Twilio Setup", description: "Connect your phone" },
  { title: "Team", description: "Add members" },
  { title: "Settings", description: "Configure calls" },
  { title: "Complete", description: "All done!" },
];

export function OnboardingWizard({ organizationName, currentStep: initialStep }: OnboardingWizardProps) {
  const [step, setStep] = useState(initialStep);
  const [twilioConfigured, setTwilioConfigured] = useState(false);
  const { organization } = useOrganization();
  const router = useRouter();

  const updateProgress = useMutation(api.organizations.updateOnboardingProgress);
  const completeOnboarding = useMutation(api.organizations.completeOnboarding);
  const skipOnboarding = useMutation(api.organizations.skipOnboarding);

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      if (organization?.id) {
        await updateProgress({ clerkOrgId: organization.id, step: nextStep });
      }
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSkip = async () => {
    if (organization?.id) {
      await skipOnboarding({ clerkOrgId: organization.id });
      router.push("/dashboard");
    }
  };

  const handleComplete = async () => {
    if (organization?.id) {
      await completeOnboarding({ clerkOrgId: organization.id });
      router.push("/dashboard");
    }
  };

  const handleTwilioConfigured = (configured: boolean) => {
    setTwilioConfigured(configured);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, index) => (
            <div key={s.title} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                    index < step
                      ? "border-primary bg-primary text-primary-foreground"
                      : index === step
                        ? "border-primary text-primary"
                        : "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {index < step ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium hidden sm:block",
                    index <= step ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {s.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-full min-w-[2rem] sm:min-w-[4rem] mx-2",
                    index < step ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="p-6">
        {step === 0 && (
          <WelcomeStep
            organizationName={organizationName}
            onNext={handleNext}
            onSkip={handleSkip}
          />
        )}
        {step === 1 && (
          <TwilioSetupStep
            onNext={handleNext}
            onBack={handleBack}
            onSkip={handleNext}
            onConfigured={handleTwilioConfigured}
          />
        )}
        {step === 2 && (
          <TeamSetupStep
            onNext={handleNext}
            onBack={handleBack}
            onSkip={handleNext}
          />
        )}
        {step === 3 && (
          <CallSettingsStep
            onNext={handleNext}
            onBack={handleBack}
            onSkip={handleNext}
          />
        )}
        {step === 4 && (
          <CompletionStep
            twilioConfigured={twilioConfigured}
            onComplete={handleComplete}
            onBack={handleBack}
          />
        )}
      </Card>

      {/* Skip all */}
      {step < 4 && step > 0 && (
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            Skip setup for now
          </Button>
        </div>
      )}
    </div>
  );
}
