"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { CheckCircle, Info } from "lucide-react";

interface RetellSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onConfigured: (configured: boolean) => void;
}

export function RetellSetupStep({ onNext, onBack, onSkip, onConfigured }: RetellSetupStepProps) {
  const platformOrg = useQuery(api.organizations.getPlatformOrg);
  const isConfigured = !!(platformOrg?.settings as any)?.retellConfigured;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title mb-1">AI Calling Agents</h2>
        <p className="text-sm text-on-surface-variant">
          AI Calling enables AI-powered inbound and outbound calling agents.
          AI agents can answer calls, make follow-ups, qualify leads, and transfer to human agents.
        </p>
      </div>

      {isConfigured ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">AI Calling is available for your organization</p>
            <p className="text-xs text-on-surface-variant mt-0.5">You can configure AI calling agents after setup.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-blue-500/30 bg-blue-500/10">
          <Info className="h-5 w-5 text-blue-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">AI Calling not yet available</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              AI Calling will be available once your platform administrator configures it. You can skip this step.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip}>Skip</Button>
          <Button onClick={onNext}>
            {isConfigured ? "Continue" : "Skip for now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
