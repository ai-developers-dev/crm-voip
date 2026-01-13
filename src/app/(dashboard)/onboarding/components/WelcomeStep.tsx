"use client";

import { Button } from "@/components/ui/button";
import { Phone, Users, Settings, Headphones } from "lucide-react";

interface WelcomeStepProps {
  organizationName: string;
  onNext: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ organizationName, onNext, onSkip }: WelcomeStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">
          Welcome to VoIP CRM, {organizationName}!
        </h1>
        <p className="text-muted-foreground">
          Let&apos;s get your phone system set up in just a few minutes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 my-8">
        <SetupItem
          icon={Phone}
          title="Connect Twilio"
          description="Link your Twilio account for calling"
        />
        <SetupItem
          icon={Users}
          title="Add Team Members"
          description="Invite agents to handle calls"
        />
        <SetupItem
          icon={Settings}
          title="Configure Settings"
          description="Set up recording and call preferences"
        />
        <SetupItem
          icon={Headphones}
          title="Start Calling"
          description="Make and receive calls instantly"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
        <Button onClick={onNext}>
          Get Started
        </Button>
      </div>
    </div>
  );
}

function SetupItem({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-border/60 bg-muted/30">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
