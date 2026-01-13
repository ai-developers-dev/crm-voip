"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertTriangle, PartyPopper, Phone, Users, Settings } from "lucide-react";

interface CompletionStepProps {
  twilioConfigured: boolean;
  onComplete: () => void;
  onBack: () => void;
}

export function CompletionStep({ twilioConfigured, onComplete, onBack }: CompletionStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <PartyPopper className="h-16 w-16 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-2">You&apos;re All Set!</h2>
        <p className="text-muted-foreground">
          Your phone system is ready to go.
        </p>
      </div>

      {/* Warning if Twilio not configured */}
      {!twilioConfigured && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <strong>Note:</strong> You skipped Twilio setup. Phone calls won&apos;t work until you
            configure your Twilio credentials in Settings.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <div className="space-y-3">
        <h3 className="font-medium">What&apos;s next?</h3>
        <div className="grid gap-3">
          <SummaryItem
            icon={Phone}
            title="Make your first call"
            description="Use the dashboard to dial out or receive incoming calls"
            configured={twilioConfigured}
          />
          <SummaryItem
            icon={Users}
            title="Manage your team"
            description="Add more agents and supervisors as needed"
            configured={true}
          />
          <SummaryItem
            icon={Settings}
            title="Fine-tune settings"
            description="Configure phone numbers, routing, and more"
            configured={true}
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onComplete}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  title,
  description,
  configured,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  configured: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-muted/30">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {configured && <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />}
    </div>
  );
}
