"use client";

import { useState } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Phone, Users, ArrowRight, CheckCircle, XCircle, Loader2,
  Building2, Pencil, AlertCircle, Mail, Unplug, Briefcase,
  Music, Settings, ImageIcon
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { cn } from "@/lib/utils";
import { Id } from "../../../../convex/_generated/dataModel";
import { updateOwnOrganization, UpdateOwnOrganizationData } from "./actions";
import { HoldMusicUpload } from "@/components/settings/hold-music-upload";
import { SalesGoalsManager } from "@/components/settings/sales-goals-manager";
import { ImageUpload } from "@/components/settings/image-upload";
import { SettingsRow } from "@/components/settings/settings-row";

export default function SettingsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user: clerkUser } = useUser();

  // Expandable row state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggleRow = (key: string) => setExpandedRow((prev) => (prev === key ? null : key));

  // Edit dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<UpdateOwnOrganizationData>({
    businessName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    ownerName: "",
    ownerEmail: "",
  });

  // Get the Convex organization
  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Get current Convex user
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id && convexOrg?._id
      ? { clerkUserId: clerkUser.id, organizationId: convexOrg._id }
      : "skip"
  );

  // Get users count
  const users = useQuery(
    api.users.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const isAdmin = convexUser?.role === "tenant_admin" || convexUser?.role === "supervisor";

  // Email accounts — admins see all org accounts, agents see only their own
  const allEmailAccounts = useQuery(
    api.emailAccounts.getByOrganization,
    isAdmin && convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );
  const myEmailAccounts = useQuery(
    api.emailAccounts.getByUser,
    !isAdmin && convexUser?._id ? { userId: convexUser._id } : "skip"
  );
  const emailAccounts = isAdmin ? allEmailAccounts : myEmailAccounts;
  const disconnectEmail = useMutation(api.emailAccounts.disconnect);
  const [isConnectingEmail, setIsConnectingEmail] = useState(false);

  // Logo upload
  const logoUrl = useQuery(
    api.logoUpload.getLogoUrl,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );
  const generateLogoUploadUrl = useMutation(api.logoUpload.generateUploadUrl);
  const saveLogo = useMutation(api.logoUpload.saveLogo);
  const deleteLogo = useMutation(api.logoUpload.deleteLogo);

  const handleLogoUpload = async (file: File) => {
    if (!convexOrg?._id) return;
    const uploadUrl = await generateLogoUploadUrl({ organizationId: convexOrg._id });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Upload failed");
    const { storageId } = await response.json();
    await saveLogo({ organizationId: convexOrg._id, storageId });
  };

  const handleLogoDelete = async () => {
    if (!convexOrg?._id) return;
    await deleteLogo({ organizationId: convexOrg._id });
  };

  const searchParams = useSearchParams();
  const emailConnected = searchParams.get("email_connected");
  const emailError = searchParams.get("email_error");

  const handleConnectEmail = async (provider?: "google" | "microsoft") => {
    if (!convexOrg?._id) return;
    setIsConnectingEmail(true);
    try {
      const res = await fetch("/api/email/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: convexOrg._id, userId: convexUser?._id, provider }),
      });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        console.error("No auth URL returned:", data);
      }
    } catch (err) {
      console.error("Failed to connect email:", err);
    } finally {
      setIsConnectingEmail(false);
    }
  };

  const handleDisconnectEmail = async (emailAccountId: string) => {
    await disconnectEmail({ emailAccountId: emailAccountId as any });
  };

  const openEditDialog = () => {
    setFormData({
      businessName: convexOrg?.name || organization?.name || "",
      streetAddress: convexOrg?.businessInfo?.streetAddress || "",
      city: convexOrg?.businessInfo?.city || "",
      state: convexOrg?.businessInfo?.state || "",
      zip: convexOrg?.businessInfo?.zip || "",
      phone: convexOrg?.businessInfo?.phone || "",
      ownerName: convexOrg?.businessInfo?.ownerName || "",
      ownerEmail: convexOrg?.businessInfo?.ownerEmail || "",
    });
    setUpdateError(null);
    setUpdateSuccess(null);
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const result = await updateOwnOrganization(formData);
      if (result.success) {
        setUpdateSuccess(result.message || "Organization updated successfully!");
        setTimeout(() => {
          setIsEditOpen(false);
          setUpdateSuccess(null);
        }, 1500);
      } else {
        setUpdateError(result.error || "Failed to update organization");
      }
    } catch (error: any) {
      console.error("Failed to update organization:", error);
      setUpdateError(error.message || "Failed to update organization");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
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

  const twilioConfigured = convexOrg?.settings?.twilioCredentials?.isConfigured ?? false;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings - {organization.name}</h1>
        <p className="text-muted-foreground">
          Manage your organization settings
        </p>
      </div>

      {/* Email connection alerts */}
      {emailConnected && (
        <Alert className="bg-green-500/10 border-green-500/20">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            Email account connected successfully!
          </AlertDescription>
        </Alert>
      )}
      {emailError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to connect email: {emailError}
          </AlertDescription>
        </Alert>
      )}

      {/* Settings Rows */}
      <div className="space-y-2">
        {/* Twilio */}
        <SettingsRow
          icon={<Phone className="h-4 w-4 text-red-600" />}
          label="Twilio"
          summary={twilioConfigured ? "Configured" : "Not Set Up"}
          badge={twilioConfigured
            ? <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Configured</Badge>
            : <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Not Set Up</Badge>
          }
          isExpanded={expandedRow === "twilio"}
          onToggle={() => toggleRow("twilio")}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Configure your Twilio credentials to enable voice calling features.
          </p>
          <Link href="/settings/twilio">
            <Button variant="outline" size="sm">
              Configure Twilio
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </SettingsRow>

        {/* Users */}
        <SettingsRow
          icon={<Users className="h-4 w-4 text-blue-600" />}
          label="Users"
          summary={`${users?.length ?? 0} users`}
          badge={<Badge variant="secondary">{users?.length ?? 0} users</Badge>}
          isExpanded={expandedRow === "users"}
          onToggle={() => toggleRow("users")}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Manage your team members, invite new users, and assign roles.
          </p>
          <Link href="/settings/users">
            <Button variant="outline" size="sm">
              Manage Users
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </SettingsRow>

        {/* Carriers */}
        <SettingsRow
          icon={<Briefcase className="h-4 w-4 text-purple-600" />}
          label="Carriers"
          summary="Lines of Business"
          isExpanded={expandedRow === "carriers"}
          onToggle={() => toggleRow("carriers")}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Select your carriers, lines of business, and configure commission rates.
          </p>
          <Link href="/settings/carriers">
            <Button variant="outline" size="sm">
              Manage Carriers
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </SettingsRow>

        {/* Sales Goals */}
        {convexOrg?._id && (
          <SettingsRow
            icon={<Settings className="h-4 w-4 text-green-600" />}
            label="Sales Goals"
            summary="Daily, Weekly, Monthly targets"
            isExpanded={expandedRow === "goals"}
            onToggle={() => toggleRow("goals")}
          >
            <SalesGoalsManager organizationId={convexOrg._id} />
          </SettingsRow>
        )}

        {/* Email */}
        <SettingsRow
          icon={<Mail className="h-4 w-4 text-amber-600" />}
          label="Email"
          summary={emailAccounts && emailAccounts.some((a) => a.status === "active")
            ? `${emailAccounts.filter((a) => a.status === "active").length} connected`
            : "Not connected"
          }
          badge={emailAccounts && emailAccounts.some((a) => a.status === "active")
            ? <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Connected</Badge>
            : <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Not Set Up</Badge>
          }
          isExpanded={expandedRow === "email"}
          onToggle={() => toggleRow("email")}
        >
          {emailAccounts && emailAccounts.filter((a) => a.status === "active").length > 0 ? (
            <div className="space-y-2">
              {emailAccounts
                .filter((a) => a.status === "active")
                .map((account) => (
                  <div key={account._id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{account.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {account.provider}
                        {isAdmin && account.userId && (
                          <span className="ml-2 text-muted-foreground/70">
                            &middot; {users?.find((u) => u._id === account.userId)?.name || "Unknown user"}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive shrink-0" onClick={() => handleDisconnectEmail(account._id)}>
                      <Unplug className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleConnectEmail("google")} disabled={isConnectingEmail}>
                  {isConnectingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Connect Gmail
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleConnectEmail("microsoft")} disabled={isConnectingEmail}>
                  {isConnectingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Connect Outlook
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Connect your Gmail or Outlook account to send and receive email within the CRM.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleConnectEmail("google")} disabled={isConnectingEmail}>
                  {isConnectingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Connect Gmail
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleConnectEmail("microsoft")} disabled={isConnectingEmail}>
                  {isConnectingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Connect Outlook
                </Button>
              </div>
            </div>
          )}
        </SettingsRow>

        {/* Agency Logo */}
        {convexOrg?._id && (
          <SettingsRow
            icon={<ImageIcon className="h-4 w-4 text-indigo-600" />}
            label="Agency Logo"
            summary={logoUrl ? "Custom logo uploaded" : "Using default"}
            isExpanded={expandedRow === "logo"}
            onToggle={() => toggleRow("logo")}
          >
            <ImageUpload
              currentImageUrl={logoUrl}
              onUpload={handleLogoUpload}
              onDelete={handleLogoDelete}
              label="Agency Logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              description="Upload your agency logo (PNG, JPG, WebP, SVG). Recommended size: 200x200px. Replaces the default VoIP CRM text in the header."
              previewShape="rounded"
              previewSize="h-12 w-auto max-w-[200px]"
            />
          </SettingsRow>
        )}

        {/* Agency Info */}
        <SettingsRow
          icon={<Building2 className="h-4 w-4 text-primary" />}
          label="Agency"
          summary="Business details"
          action={
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openEditDialog(); }}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          }
          isExpanded={expandedRow === "org"}
          onToggle={() => toggleRow("org")}
        >
          {convexOrg?.businessInfo ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Business Name</dt>
                <dd className="font-medium">{convexOrg.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{convexOrg.businessInfo.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Owner</dt>
                <dd className="font-medium">{convexOrg.businessInfo.ownerName || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Owner Email</dt>
                <dd className="font-medium">{convexOrg.businessInfo.ownerEmail || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-medium">
                  {convexOrg.businessInfo.streetAddress ? (
                    <>
                      {convexOrg.businessInfo.streetAddress}, {convexOrg.businessInfo.city}, {convexOrg.businessInfo.state} {convexOrg.businessInfo.zip}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No business information on file.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={openEditDialog}>
                Add Organization Info
              </Button>
            </div>
          )}
        </SettingsRow>

        {/* Hold Music */}
        {convexOrg?._id && (
          <SettingsRow
            icon={<Music className="h-4 w-4 text-teal-600" />}
            label="Hold Music"
            summary="Custom hold music"
            isExpanded={expandedRow === "holdmusic"}
            onToggle={() => toggleRow("holdmusic")}
          >
            <HoldMusicUpload organizationId={convexOrg._id} />
          </SettingsRow>
        )}
      </div>

      {/* Edit Organization Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        if (!open) {
          setUpdateError(null);
          setUpdateSuccess(null);
        }
        setIsEditOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Organization Info</DialogTitle>
            <DialogDescription>
              Update your business contact details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate}>
            {updateError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{updateError}</AlertDescription>
              </Alert>
            )}
            {updateSuccess && (
              <Alert className="mb-4 bg-primary/10 border-primary/20">
                <CheckCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-foreground">{updateSuccess}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4 py-4">
              {/* Business Information */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    placeholder="Your Business Name"
                    value={formData.businessName}
                    onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="streetAddress">Street Address *</Label>
                  <Input
                    id="streetAddress"
                    placeholder="123 Main Street"
                    value={formData.streetAddress}
                    onChange={(e) => setFormData(prev => ({ ...prev, streetAddress: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                </div>
                <div className="grid grid-cols-6 gap-4">
                  <div className="col-span-3 space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      placeholder="Los Angeles"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      required
                      disabled={isUpdating || !!updateSuccess}
                    />
                  </div>
                  <div className="col-span-1 space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      placeholder="CA"
                      maxLength={2}
                      value={formData.state}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                      required
                      disabled={isUpdating || !!updateSuccess}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="zip">ZIP Code *</Label>
                    <Input
                      id="zip"
                      placeholder="90001"
                      value={formData.zip}
                      onChange={(e) => setFormData(prev => ({ ...prev, zip: e.target.value }))}
                      required
                      disabled={isUpdating || !!updateSuccess}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Business Phone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                </div>
              </div>

              {/* Owner Information */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Owner Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Owner Name *</Label>
                  <Input
                    id="ownerName"
                    placeholder="John Smith"
                    value={formData.ownerName}
                    onChange={(e) => setFormData(prev => ({ ...prev, ownerName: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerEmail">Owner Email *</Label>
                  <Input
                    id="ownerEmail"
                    type="email"
                    placeholder="owner@example.com"
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, ownerEmail: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                  <p className="text-xs text-muted-foreground">
                    This is your business contact email for billing and communication purposes.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditOpen(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating || !!updateSuccess}>
                {isUpdating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : updateSuccess ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Saved!
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
