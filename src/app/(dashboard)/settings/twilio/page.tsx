"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronRight, Phone, Loader2, CheckCircle, Eye, EyeOff, Save } from "lucide-react";
import Link from "next/link";

export default function TwilioSettingsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    accountSid: "",
    authToken: "",
    apiKey: "",
    apiSecret: "",
    twimlAppSid: "",
  });

  // Get the Convex organization
  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Get existing Twilio credentials
  const existingCreds = useQuery(
    api.organizations.getTwilioCredentials,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  // Update mutation
  const updateTwilioCredentials = useMutation(api.organizations.updateTwilioCredentials);

  // Pre-fill form when existing credentials load
  if (existingCreds && formData.accountSid === "" && existingCreds.accountSid) {
    setFormData({
      accountSid: existingCreds.accountSid,
      authToken: "", // Don't pre-fill sensitive fields
      apiKey: existingCreds.apiKey || "",
      apiSecret: "",
      twimlAppSid: existingCreds.twimlAppSid || "",
    });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convexOrg?._id) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await updateTwilioCredentials({
        organizationId: convexOrg._id,
        twilioCredentials: {
          accountSid: formData.accountSid,
          authToken: formData.authToken,
          apiKey: formData.apiKey || undefined,
          apiSecret: formData.apiSecret || undefined,
          twimlAppSid: formData.twimlAppSid || undefined,
        },
      });
      setSaveSuccess(true);
      // Clear sensitive fields after save
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

  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Organization Selected</CardTitle>
            <CardDescription>
              Please select an organization to manage settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isConfigured = existingCreds?.isConfigured ?? false;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/settings" className="hover:text-foreground transition-colors">
          Settings
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">Twilio</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Twilio Settings</h1>
        <p className="text-muted-foreground">
          Configure your Twilio credentials for voice calling
        </p>
      </div>

      {/* Status Badge */}
      {isConfigured && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Twilio is configured and ready to use. Update credentials below if needed.
          </AlertDescription>
        </Alert>
      )}

      {saveSuccess && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Twilio credentials saved successfully!
          </AlertDescription>
        </Alert>
      )}

      {/* Credentials Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <Phone className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <CardTitle>API Credentials</CardTitle>
              <CardDescription>
                Enter your Twilio account credentials from{" "}
                <a
                  href="https://console.twilio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  console.twilio.com
                </a>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account SID */}
            <div className="space-y-2">
              <Label htmlFor="accountSid">Account SID *</Label>
              <Input
                id="accountSid"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={formData.accountSid}
                onChange={(e) => setFormData(prev => ({ ...prev, accountSid: e.target.value }))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Found on your Twilio Console dashboard
              </p>
            </div>

            {/* Auth Token */}
            <div className="space-y-2">
              <Label htmlFor="authToken">Auth Token *</Label>
              <div className="relative">
                <Input
                  id="authToken"
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

            {/* API Key (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key (Optional)</Label>
              <Input
                id="apiKey"
                placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={formData.apiKey}
                onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                For enhanced security, use API Keys instead of Auth Token
              </p>
            </div>

            {/* API Secret (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="apiSecret">API Secret (Optional)</Label>
              <div className="relative">
                <Input
                  id="apiSecret"
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

            {/* TwiML App SID (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="twimlAppSid">TwiML App SID (Optional)</Label>
              <Input
                id="twimlAppSid"
                placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={formData.twimlAppSid}
                onChange={(e) => setFormData(prev => ({ ...prev, twimlAppSid: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Required for browser-based calling. Create at Console → Voice → TwiML Apps
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button type="submit" className="w-full" disabled={isSaving}>
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
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Need Help?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>To find your Twilio credentials:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Log in to your <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Twilio Console</a></li>
            <li>Your Account SID and Auth Token are on the main dashboard</li>
            <li>For API Keys, go to Account → API Keys & Tokens</li>
            <li>For TwiML Apps, go to Voice → TwiML → TwiML Apps</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
