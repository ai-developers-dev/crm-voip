"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle, Eye, EyeOff, Save } from "lucide-react";

interface TwilioSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
}

export function TwilioSettingsDialog({
  open,
  onOpenChange,
  organizationId,
}: TwilioSettingsDialogProps) {
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);

  const [formData, setFormData] = useState({
    accountSid: "",
    authToken: "",
    apiKey: "",
    apiSecret: "",
    twimlAppSid: "",
  });

  const existingCreds = useQuery(
    api.organizations.getTwilioCredentials,
    open ? { organizationId } : "skip"
  );

  const updateTwilioCredentials = useMutation(api.organizations.updateTwilioCredentials);

  // Pre-fill form when existing credentials load
  useEffect(() => {
    if (open && existingCreds && !formInitialized && existingCreds.accountSid) {
      setFormData({
        accountSid: existingCreds.accountSid,
        authToken: "",
        apiKey: existingCreds.apiKey || "",
        apiSecret: "",
        twimlAppSid: existingCreds.twimlAppSid || "",
      });
      setFormInitialized(true);
    }
  }, [open, existingCreds, formInitialized]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setFormInitialized(false);
      setSaveSuccess(false);
      setShowAuthToken(false);
      setShowApiSecret(false);
    }
  }, [open]);

  const isConfigured = existingCreds?.isConfigured ?? false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await updateTwilioCredentials({
        organizationId,
        twilioCredentials: {
          accountSid: formData.accountSid,
          authToken: formData.authToken,
          apiKey: formData.apiKey || undefined,
          apiSecret: formData.apiSecret || undefined,
          twimlAppSid: formData.twimlAppSid || undefined,
        },
      });
      setSaveSuccess(true);
      setFormData(prev => ({
        ...prev,
        authToken: "",
        apiSecret: "",
      }));
    } catch (error) {
      console.error("Failed to save Twilio credentials:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Phone System Settings</DialogTitle>
          <DialogDescription>
            Configure your voice calling credentials.
          </DialogDescription>
        </DialogHeader>

        {saveSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Phone system credentials saved!
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="twilio-accountSid">Account SID *</Label>
            <Input
              id="twilio-accountSid"
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={formData.accountSid}
              onChange={(e) => setFormData(prev => ({ ...prev, accountSid: e.target.value }))}
              required
            />
            <p className="text-xs text-muted-foreground">
              Your Account SID from your provider dashboard
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="twilio-authToken">Auth Token *</Label>
            <div className="relative">
              <Input
                id="twilio-authToken"
                type={showAuthToken ? "text" : "password"}
                placeholder={isConfigured ? "••••••••" : "Enter your Auth Token"}
                value={formData.authToken}
                onChange={(e) => setFormData(prev => ({ ...prev, authToken: e.target.value }))}
                required={!isConfigured}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowAuthToken(!showAuthToken)}
              >
                {showAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {isConfigured && (
              <p className="text-xs text-muted-foreground">
                Leave blank to keep existing token: {existingCreds?.authToken}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="twilio-apiKey">API Key (Optional)</Label>
            <Input
              id="twilio-apiKey"
              placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={formData.apiKey}
              onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              For enhanced security, use API Keys instead of Auth Token
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="twilio-apiSecret">API Secret (Optional)</Label>
            <div className="relative">
              <Input
                id="twilio-apiSecret"
                type={showApiSecret ? "text" : "password"}
                placeholder={existingCreds?.apiSecret ? "••••••••" : "Enter your API Secret"}
                value={formData.apiSecret}
                onChange={(e) => setFormData(prev => ({ ...prev, apiSecret: e.target.value }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiSecret(!showApiSecret)}
              >
                {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="twilio-twimlAppSid">TwiML App SID (Optional)</Label>
            <Input
              id="twilio-twimlAppSid"
              placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={formData.twimlAppSid}
              onChange={(e) => setFormData(prev => ({ ...prev, twimlAppSid: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Required for browser-based calling
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Credentials
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
