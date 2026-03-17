"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, Bot } from "lucide-react";

interface RetellSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onConfigured: (configured: boolean) => void;
}

export function RetellSetupStep({ onNext, onBack, onSkip, onConfigured }: RetellSetupStepProps) {
  const { organization } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const isConfigured = !!(convexOrg?.settings as any)?.retellConfigured;

  const handleSave = async () => {
    if (!convexOrg?._id || !apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/retell/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: convexOrg._id, apiKey: apiKey.trim() }),
      });
      if (res.ok) {
        setApiKey("");
        onConfigured(true);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save API key");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title mb-1">AI Calling Agents</h2>
        <p className="text-sm text-muted-foreground">
          Set up AI Calling to enable AI-powered inbound and outbound calling agents.
          AI agents can answer calls, make follow-ups, qualify leads, and transfer to human agents.
        </p>
      </div>

      {isConfigured ? (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">AI Calling Connected</p>
            <p className="text-xs text-muted-foreground mt-0.5">You can configure AI calling agents after setup.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-5 w-5 text-cyan-600" />
              <span className="text-sm font-semibold">Set Up AI Calling</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Add your AI Calling API key to enable AI-powered calling agents.
              Get this from your administrator.
            </p>

            <div className="field-gap">
              <Label className="text-xs">AI Calling API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="key_..."
                className="h-9 text-sm font-mono"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button onClick={handleSave} disabled={!apiKey.trim() || saving} size="sm">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving...</> : "Save API Key"}
            </Button>
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
