"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, ExternalLink, AlertCircle } from "lucide-react";

interface TwilioSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onConfigured: (configured: boolean) => void;
}

export function TwilioSetupStep({ onNext, onBack, onSkip, onConfigured }: TwilioSetupStepProps) {
  const { organization } = useOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    accountSid: "",
    authToken: "",
    apiKey: "",
    apiSecret: "",
    twimlAppSid: "",
  });

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const saveTwilioCredentials = useMutation(api.organizations.saveTwilioCredentials);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!convexOrg?._id) {
      setError("Organization not found. Please refresh and try again.");
      return;
    }

    if (!formData.accountSid || !formData.authToken) {
      setError("Account SID and Auth Token are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await saveTwilioCredentials({
        organizationId: convexOrg._id,
        accountSid: formData.accountSid,
        authToken: formData.authToken,
        apiKey: formData.apiKey || undefined,
        apiSecret: formData.apiSecret || undefined,
        twimlAppSid: formData.twimlAppSid || undefined,
      });
      setSuccess(true);
      onConfigured(true);
    } catch (err: any) {
      setError(err.message || "Failed to save credentials. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    onConfigured(false);
    onSkip();
  };

  if (success) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Twilio Connected!</h2>
          <p className="text-muted-foreground">
            Your phone system is ready to make and receive calls.
          </p>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Connect Your Twilio Account</h2>
        <p className="text-muted-foreground">
          Enter your Twilio credentials to enable phone calls.{" "}
          <a
            href="https://console.twilio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Get credentials <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="accountSid">Account SID *</Label>
          <Input
            id="accountSid"
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={formData.accountSid}
            onChange={(e) => setFormData((prev) => ({ ...prev, accountSid: e.target.value }))}
            required
          />
          <p className="text-xs text-muted-foreground">
            Found on your Twilio Console dashboard
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="authToken">Auth Token *</Label>
          <Input
            id="authToken"
            type="password"
            placeholder="Your auth token"
            value={formData.authToken}
            onChange={(e) => setFormData((prev) => ({ ...prev, authToken: e.target.value }))}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key (Optional)</Label>
            <Input
              id="apiKey"
              placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={formData.apiKey}
              onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiSecret">API Secret (Optional)</Label>
            <Input
              id="apiSecret"
              type="password"
              placeholder="Your API secret"
              value={formData.apiSecret}
              onChange={(e) => setFormData((prev) => ({ ...prev, apiSecret: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="twimlAppSid">TwiML App SID (Optional)</Label>
          <Input
            id="twimlAppSid"
            placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={formData.twimlAppSid}
            onChange={(e) => setFormData((prev) => ({ ...prev, twimlAppSid: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Required for browser-based calling. You can set this up later.
          </p>
        </div>

        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Skip for now
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save & Continue"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
