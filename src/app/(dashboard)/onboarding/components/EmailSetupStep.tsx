"use client";

import { useState } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, Mail, Unplug, AlertCircle } from "lucide-react";

interface EmailSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onConfigured: (configured: boolean) => void;
}

export function EmailSetupStep({ onNext, onBack, onSkip, onConfigured }: EmailSetupStepProps) {
  const { organization } = useOrganization();
  const { user: clerkUser } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id && convexOrg?._id
      ? { clerkUserId: clerkUser.id, organizationId: convexOrg._id }
      : "skip"
  );

  const emailAccounts = useQuery(
    api.emailAccounts.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const disconnectEmail = useMutation(api.emailAccounts.disconnect);

  const activeAccounts = emailAccounts?.filter((a) => a.status === "active") ?? [];
  const hasActiveAccount = activeAccounts.length > 0;

  const handleConnect = async (provider: "google" | "microsoft") => {
    if (!convexOrg?._id) return;
    setIsConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/email/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: convexOrg._id, userId: convexUser?._id, provider }),
      });
      const data = await res.json();
      if (data.authUrl) {
        sessionStorage.setItem("email_connect_return", "/onboarding");
        window.location.href = data.authUrl;
      } else {
        setError("Failed to generate authorization URL. Please try again.");
      }
    } catch (err) {
      console.error("Failed to connect email:", err);
      setError("Failed to connect email. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (emailAccountId: string) => {
    try {
      await disconnectEmail({ emailAccountId: emailAccountId as any });
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  };

  const handleSkip = () => {
    onConfigured(false);
    onSkip();
  };

  const handleContinue = () => {
    onConfigured(hasActiveAccount);
    onNext();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Connect Your Email</h2>
        <p className="text-muted-foreground">
          Connect your Gmail or Outlook account to send and receive email directly within the CRM.
          This step is optional and can be done later from Settings.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Connected accounts */}
      {activeAccounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Connected Accounts</p>
          {activeAccounts.map((account) => (
            <div
              key={account._id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{account.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{account.provider}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive shrink-0"
                onClick={() => handleDisconnect(account._id)}
              >
                <Unplug className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Connect buttons */}
      {!hasActiveAccount ? (
        <div className="flex flex-col items-center gap-4 py-6 rounded-lg border-2 border-dashed">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <Mail className="h-6 w-6 text-amber-600" />
          </div>
          <div className="text-center">
            <p className="font-medium">No email account connected</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect Gmail or Outlook to get started
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => handleConnect("google")} disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Connect Gmail
            </Button>
            <Button variant="outline" onClick={() => handleConnect("microsoft")} disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Connect Outlook
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleConnect("google")} disabled={isConnecting} className="flex-1">
            {isConnecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Connect Gmail
          </Button>
          <Button variant="outline" onClick={() => handleConnect("microsoft")} disabled={isConnecting} className="flex-1">
            {isConnecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Connect Outlook
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
          <Button onClick={handleContinue}>
            {hasActiveAccount ? "Continue" : "Skip & Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
