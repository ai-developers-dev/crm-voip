"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";

interface CallSettingsStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function CallSettingsStep({ onNext, onBack, onSkip }: CallSettingsStepProps) {
  const { organization } = useOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    recordingEnabled: true,
    maxConcurrentCalls: 10,
    holdMusicUrl: "",
  });

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const updateSettings = useMutation(api.organizations.updateSettings);

  const handleSubmit = async () => {
    if (!convexOrg?._id) {
      setError("Organization not found. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateSettings({
        organizationId: convexOrg._id,
        settings: {
          recordingEnabled: settings.recordingEnabled,
          maxConcurrentCalls: settings.maxConcurrentCalls,
          holdMusicUrl: settings.holdMusicUrl || undefined,
        },
      });
      onNext();
    } catch (err: any) {
      setError(err.message || "Failed to save settings. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Call Settings</h2>
        <p className="text-muted-foreground">
          Configure your call recording and capacity preferences.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* Recording toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-muted/30">
          <div>
            <Label className="text-base">Call Recording</Label>
            <p className="text-sm text-muted-foreground">
              Automatically record all incoming and outgoing calls
            </p>
          </div>
          <Switch
            checked={settings.recordingEnabled}
            onCheckedChange={(checked) =>
              setSettings((prev) => ({ ...prev, recordingEnabled: checked }))
            }
          />
        </div>

        {/* Max concurrent calls */}
        <div className="space-y-2">
          <Label htmlFor="maxCalls">Maximum Concurrent Calls</Label>
          <Input
            id="maxCalls"
            type="number"
            min={1}
            max={100}
            value={settings.maxConcurrentCalls}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                maxConcurrentCalls: parseInt(e.target.value) || 10,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of calls your team can handle simultaneously (1-100)
          </p>
        </div>

        {/* Hold music URL */}
        <div className="space-y-2">
          <Label htmlFor="holdMusic">Custom Hold Music URL (Optional)</Label>
          <Input
            id="holdMusic"
            type="url"
            placeholder="https://example.com/hold-music.mp3"
            value={settings.holdMusicUrl}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, holdMusicUrl: e.target.value }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use the default hold music
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save & Continue"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
