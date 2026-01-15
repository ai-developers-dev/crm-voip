"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
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
  Phone, Users, Settings, ArrowRight, CheckCircle, XCircle, Loader2,
  ChevronRight, ArrowLeft, Eye, Building2, Pencil, AlertCircle
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { updateTenant, UpdateTenantData } from "../../../actions";
import { HoldMusicUpload } from "@/components/settings/hold-music-upload";

export default function TenantSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const tenantId = params.id as string;

  // Check if user is a platform admin
  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Get the tenant organization by ID
  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  // Get users count
  const users = useQuery(
    api.users.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  // Edit dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<UpdateTenantData>({
    organizationId: "" as Id<"organizations">,
    businessName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    ownerName: "",
    ownerEmail: "",
    basePlanPrice: 0,
    perUserPrice: 0,
    includedUsers: 1,
  });

  const openEditDialog = () => {
    if (!tenant) return;
    setFormData({
      organizationId: tenant._id,
      businessName: tenant.name || "",
      streetAddress: tenant.businessInfo?.streetAddress || "",
      city: tenant.businessInfo?.city || "",
      state: tenant.businessInfo?.state || "",
      zip: tenant.businessInfo?.zip || "",
      phone: tenant.businessInfo?.phone || "",
      ownerName: tenant.businessInfo?.ownerName || "",
      ownerEmail: tenant.businessInfo?.ownerEmail || "",
      basePlanPrice: tenant.billing?.basePlanPrice ?? 0,
      perUserPrice: tenant.billing?.perUserPrice ?? 0,
      includedUsers: tenant.billing?.includedUsers ?? 1,
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
      const result = await updateTenant(formData);
      if (result.success) {
        setUpdateSuccess(result.message || "Tenant updated successfully!");
        setTimeout(() => {
          setIsEditOpen(false);
          setUpdateSuccess(null);
        }, 1500);
      } else {
        setUpdateError(result.error || "Failed to update tenant");
      }
    } catch (error: any) {
      console.error("Failed to update tenant:", error);
      setUpdateError(error.message || "Failed to update tenant");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!userLoaded || isPlatformUser === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Only platform users can access this page
  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access tenant settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tenant === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenant === null) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Tenant Not Found</CardTitle>
            <CardDescription>
              The tenant organization you're looking for doesn't exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin">
              <Button className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const twilioConfigured = tenant?.settings?.twilioCredentials?.isConfigured ?? false;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Impersonation Banner */}
      <Alert className="rounded-none border-x-0 border-t-0 bg-amber-500/10 border-amber-500/20">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-400">
            <strong>Managing:</strong> {tenant.name} Settings ({tenant.plan} plan)
          </span>
          <div className="flex gap-2">
            <Link href={`/admin/tenants/${tenant._id}`}>
              <Button variant="outline" size="sm" className="border-amber-500/30 hover:bg-amber-500/10">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </AlertDescription>
      </Alert>

      <div className="p-6 max-w-4xl mx-auto space-y-6 flex-1">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground transition-colors">
            Admin
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link href={`/admin/tenants/${tenant._id}`} className="hover:text-foreground transition-colors">
            {tenant.name}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">Settings</span>
        </nav>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Tenant Settings</h1>
          <p className="text-muted-foreground">
            Manage settings for {tenant.name}
          </p>
        </div>

        {/* Settings Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Twilio Settings */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                    <Phone className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Twilio</CardTitle>
                    <CardDescription>Voice & Phone Settings</CardDescription>
                  </div>
                </div>
                {twilioConfigured ? (
                  <Badge variant="default" className="gap-1 bg-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    Not Set Up
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Configure Twilio credentials to enable voice calling for this tenant.
              </p>
              <Link href={`/admin/tenants/${tenant._id}/settings/twilio`}>
                <Button variant="outline" className="w-full">
                  Configure Twilio
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* User Management */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Users</CardTitle>
                    <CardDescription>Team Management</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary">
                  {users?.length ?? 0} users
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View and manage team members for this tenant organization.
              </p>
              <Link href={`/admin/tenants/${tenant._id}/settings/users`}>
                <Button variant="outline" className="w-full">
                  Manage Users
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Organization Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Organization Details</CardTitle>
                  <CardDescription>Tenant organization information</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={openEditDialog}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{tenant.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Plan</dt>
                <dd>
                  <Badge variant="secondary">{tenant.plan ?? "free"}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Max Concurrent Calls</dt>
                <dd className="font-medium">{tenant.settings?.maxConcurrentCalls ?? 5}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Recording</dt>
                <dd className="font-medium">
                  {tenant.settings?.recordingEnabled ? "Enabled" : "Disabled"}
                </dd>
              </div>
              {tenant.businessInfo && (
                <>
                  <div>
                    <dt className="text-muted-foreground">Owner</dt>
                    <dd className="font-medium">{tenant.businessInfo.ownerName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Owner Email</dt>
                    <dd className="font-medium">{tenant.businessInfo.ownerEmail}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Address</dt>
                    <dd className="font-medium">
                      {tenant.businessInfo.streetAddress}, {tenant.businessInfo.city}, {tenant.businessInfo.state} {tenant.businessInfo.zip}
                    </dd>
                  </div>
                </>
              )}
              {tenant.billing && (
                <>
                  <div>
                    <dt className="text-muted-foreground">Base Plan Price</dt>
                    <dd className="font-medium">${tenant.billing.basePlanPrice}/mo</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Per User Price</dt>
                    <dd className="font-medium">${tenant.billing.perUserPrice}/mo</dd>
                  </div>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Hold Music Upload */}
        {tenant._id && (
          <HoldMusicUpload organizationId={tenant._id} />
        )}
      </div>

      {/* Edit Tenant Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        if (!open) {
          setUpdateError(null);
          setUpdateSuccess(null);
        }
        setIsEditOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Tenant Details</DialogTitle>
            <DialogDescription>
              Update business and billing information for this tenant.
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
                <h3 className="font-medium text-sm text-muted-foreground">Business Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    placeholder="Business Name"
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
                </div>
              </div>

              {/* Billing Information */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Billing (Platform Admin Only)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="basePlanPrice">Base Plan Price</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="basePlanPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="pl-7"
                        value={formData.basePlanPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, basePlanPrice: parseFloat(e.target.value) || 0 }))}
                        disabled={isUpdating || !!updateSuccess}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">per month</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="perUserPrice">Per User Price</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="perUserPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="pl-7"
                        value={formData.perUserPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, perUserPrice: parseFloat(e.target.value) || 0 }))}
                        disabled={isUpdating || !!updateSuccess}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">per month</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="includedUsers">Included Users</Label>
                    <Input
                      id="includedUsers"
                      type="number"
                      min="1"
                      placeholder="1"
                      value={formData.includedUsers}
                      onChange={(e) => setFormData(prev => ({ ...prev, includedUsers: parseInt(e.target.value) || 1 }))}
                      disabled={isUpdating || !!updateSuccess}
                    />
                    <p className="text-xs text-muted-foreground">users included</p>
                  </div>
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
