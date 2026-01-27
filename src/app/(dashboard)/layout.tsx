"use client";

import { useAuth, useUser, useOrganization, useClerk } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import {
  Phone, Settings, Building2, Shield, LogOut, UserCog,
  ChevronDown, Plus, Loader2, AlertCircle, CheckCircle, BarChart3, Users,
  Wifi, WifiOff, RefreshCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createTenant, updateTenant, CreateTenantData } from "./admin/actions";
import { CallingProvider, useOptionalCallingContext } from "@/components/calling/calling-provider";
import { GlobalIncomingBanner } from "@/components/calling/global-incoming-banner";
import { ActiveCallBar } from "@/components/calling/active-call-bar";

function TenantSwitcher() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tenants = useQuery(api.organizations.getAllTenants);
  const { setActive } = useClerk();
  const router = useRouter();

  // Edit dialog state
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<CreateTenantData>({
    businessName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    ownerName: "",
    ownerEmail: "",
    basePlanPrice: 97,
    perUserPrice: 47,
    includedUsers: 1,
  });

  // Add dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateTenantData>({
    businessName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    ownerName: "",
    ownerEmail: "",
    basePlanPrice: 97,
    perUserPrice: 47,
    includedUsers: 1,
  });

  const resetForm = () => {
    setFormData({
      businessName: "",
      streetAddress: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      ownerName: "",
      ownerEmail: "",
      basePlanPrice: 97,
      perUserPrice: 47,
      includedUsers: 1,
    });
    setCreateError(null);
    setCreateSuccess(null);
  };

  const openEditDialog = (tenant: any) => {
    setEditFormData({
      businessName: tenant.name,
      streetAddress: tenant.businessInfo?.streetAddress || "",
      city: tenant.businessInfo?.city || "",
      state: tenant.businessInfo?.state || "",
      zip: tenant.businessInfo?.zip || "",
      phone: tenant.businessInfo?.phone || "",
      ownerName: tenant.businessInfo?.ownerName || "",
      ownerEmail: tenant.businessInfo?.ownerEmail || "",
      basePlanPrice: tenant.billing?.basePlanPrice || 97,
      perUserPrice: tenant.billing?.perUserPrice || 47,
      includedUsers: tenant.billing?.includedUsers || 1,
    });
    setUpdateError(null);
    setUpdateSuccess(null);
    setEditingTenant(tenant);
    setOpen(false);
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    setIsUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const result = await updateTenant({
        organizationId: editingTenant._id,
        ...editFormData,
      });
      if (result.success) {
        setUpdateSuccess(result.message || "Tenant updated successfully!");
        setTimeout(() => {
          setEditingTenant(null);
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

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const result = await createTenant(formData);
      if (result.success) {
        setCreateSuccess(result.message || "Tenant created successfully!");
        setTimeout(() => {
          resetForm();
          setIsAddDialogOpen(false);
        }, 2000);
      } else {
        setCreateError(result.error || "Failed to create tenant");
      }
    } catch (error: any) {
      console.error("Failed to create tenant:", error);
      setCreateError(error.message || "Failed to create tenant");
    } finally {
      setIsCreating(false);
    }
  };

  const monthlyEstimate = formData.basePlanPrice + (formData.perUserPrice * Math.max(0, formData.includedUsers - 1));
  const editMonthlyEstimate = editFormData.basePlanPrice + (editFormData.perUserPrice * Math.max(0, editFormData.includedUsers - 1));

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-2 py-1 text-sm border border-border/60 rounded-md hover:bg-muted transition-colors"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-medium">
            T
          </div>
          <span className="font-medium">Tenants</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute left-0 mt-2 w-80 rounded-xl border border-border bg-card shadow-xl z-50">
            {/* Tenant List */}
            <div className="max-h-72 overflow-y-auto py-2">
              {tenants && tenants.length > 0 ? (
                tenants.map((tenant) => (
                  <div
                    key={tenant._id}
                    className="flex items-center justify-between px-3 py-2 mx-2 hover:bg-muted rounded-lg group"
                  >
                    <button
                      onClick={async () => {
                        setOpen(false);
                        // Switch Clerk org session to this tenant
                        if (tenant.clerkOrgId) {
                          await setActive({ organization: tenant.clerkOrgId });
                        }
                        // Then navigate
                        router.push(`/admin/tenants/${tenant._id}`);
                      }}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-medium shrink-0">
                        {tenant.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{tenant.plan}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => openEditDialog(tenant)}
                      className="p-2 hover:bg-background rounded-md transition-colors border border-border/60"
                      title="Edit Tenant"
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No tenants yet</p>
                </div>
              )}
            </div>

            {/* Add Tenant Button */}
            <div className="border-t border-border p-2">
              <button
                onClick={() => {
                  resetForm();
                  setIsAddDialogOpen(true);
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create tenant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Tenant Dialog */}
      <Dialog open={!!editingTenant} onOpenChange={(open) => {
        if (!open) {
          setEditingTenant(null);
          setUpdateError(null);
          setUpdateSuccess(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>
              Update the tenant organization details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateTenant}>
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
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">Business Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="edit-businessName">Business Name *</Label>
                  <Input id="edit-businessName" value={editFormData.businessName} onChange={(e) => setEditFormData(prev => ({ ...prev, businessName: e.target.value }))} required disabled={isUpdating || !!updateSuccess} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-streetAddress">Street Address *</Label>
                  <Input id="edit-streetAddress" value={editFormData.streetAddress} onChange={(e) => setEditFormData(prev => ({ ...prev, streetAddress: e.target.value }))} required disabled={isUpdating || !!updateSuccess} />
                </div>
                <div className="grid grid-cols-6 gap-4">
                  <div className="col-span-3 space-y-2">
                    <Label htmlFor="edit-city">City *</Label>
                    <Input id="edit-city" value={editFormData.city} onChange={(e) => setEditFormData(prev => ({ ...prev, city: e.target.value }))} required disabled={isUpdating || !!updateSuccess} />
                  </div>
                  <div className="col-span-1 space-y-2">
                    <Label htmlFor="edit-state">State *</Label>
                    <Input id="edit-state" maxLength={2} value={editFormData.state} onChange={(e) => setEditFormData(prev => ({ ...prev, state: e.target.value.toUpperCase() }))} required disabled={isUpdating || !!updateSuccess} />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="edit-zip">ZIP *</Label>
                    <Input id="edit-zip" value={editFormData.zip} onChange={(e) => setEditFormData(prev => ({ ...prev, zip: e.target.value }))} required disabled={isUpdating || !!updateSuccess} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Business Phone *</Label>
                  <Input id="edit-phone" type="tel" value={editFormData.phone} onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))} required disabled={isUpdating || !!updateSuccess} />
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Owner Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="edit-ownerName">Owner Name *</Label>
                  <Input id="edit-ownerName" value={editFormData.ownerName} onChange={(e) => setEditFormData(prev => ({ ...prev, ownerName: e.target.value }))} required disabled={isUpdating || !!updateSuccess} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-ownerEmail">Owner Email *</Label>
                  <Input id="edit-ownerEmail" type="email" value={editFormData.ownerEmail} onChange={(e) => setEditFormData(prev => ({ ...prev, ownerEmail: e.target.value }))} required disabled={isUpdating || !!updateSuccess} />
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Plan & Pricing</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-basePlanPrice">Base ($/mo)</Label>
                    <Input id="edit-basePlanPrice" type="number" min="0" value={editFormData.basePlanPrice} onChange={(e) => setEditFormData(prev => ({ ...prev, basePlanPrice: parseInt(e.target.value) || 0 }))} disabled={isUpdating || !!updateSuccess} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-perUserPrice">Per User ($/mo)</Label>
                    <Input id="edit-perUserPrice" type="number" min="0" value={editFormData.perUserPrice} onChange={(e) => setEditFormData(prev => ({ ...prev, perUserPrice: parseInt(e.target.value) || 0 }))} disabled={isUpdating || !!updateSuccess} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-includedUsers">Included Users</Label>
                    <Input id="edit-includedUsers" type="number" min="1" value={editFormData.includedUsers} onChange={(e) => setEditFormData(prev => ({ ...prev, includedUsers: parseInt(e.target.value) || 1 }))} disabled={isUpdating || !!updateSuccess} />
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Monthly Estimate</span>
                    <span className="text-2xl font-bold">${editMonthlyEstimate}</span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingTenant(null)} disabled={isUpdating}>Cancel</Button>
              <Button type="submit" disabled={isUpdating || !!updateSuccess}>
                {isUpdating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</> : updateSuccess ? <><CheckCircle className="h-4 w-4 mr-2" />Updated!</> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Tenant Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsAddDialogOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Tenant</DialogTitle>
            <DialogDescription>Create a new tenant organization. An invitation will be sent to the owner.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTenant}>
            {createError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            {createSuccess && (
              <Alert className="mb-4 bg-primary/10 border-primary/20">
                <CheckCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-foreground">{createSuccess}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4 py-4">
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">Business Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input id="businessName" placeholder="Acme Insurance Agency" value={formData.businessName} onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))} required disabled={isCreating || !!createSuccess} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="streetAddress">Street Address *</Label>
                  <Input id="streetAddress" placeholder="123 Main Street" value={formData.streetAddress} onChange={(e) => setFormData(prev => ({ ...prev, streetAddress: e.target.value }))} required disabled={isCreating || !!createSuccess} />
                </div>
                <div className="grid grid-cols-6 gap-4">
                  <div className="col-span-3 space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input id="city" placeholder="Los Angeles" value={formData.city} onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))} required disabled={isCreating || !!createSuccess} />
                  </div>
                  <div className="col-span-1 space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input id="state" placeholder="CA" maxLength={2} value={formData.state} onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value.toUpperCase() }))} required disabled={isCreating || !!createSuccess} />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="zip">ZIP Code *</Label>
                    <Input id="zip" placeholder="90001" value={formData.zip} onChange={(e) => setFormData(prev => ({ ...prev, zip: e.target.value }))} required disabled={isCreating || !!createSuccess} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Business Phone *</Label>
                  <Input id="phone" type="tel" placeholder="(555) 123-4567" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} required disabled={isCreating || !!createSuccess} />
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Owner Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Owner Name *</Label>
                  <Input id="ownerName" placeholder="John Smith" value={formData.ownerName} onChange={(e) => setFormData(prev => ({ ...prev, ownerName: e.target.value }))} required disabled={isCreating || !!createSuccess} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerEmail">Owner Email *</Label>
                  <Input id="ownerEmail" type="email" placeholder="john@acmeinsurance.com" value={formData.ownerEmail} onChange={(e) => setFormData(prev => ({ ...prev, ownerEmail: e.target.value }))} required disabled={isCreating || !!createSuccess} />
                  <p className="text-xs text-muted-foreground">An invitation will be sent to this email address</p>
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Plan & Pricing</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="basePlanPrice">Base Plan ($/mo) *</Label>
                    <Input id="basePlanPrice" type="number" min="0" value={formData.basePlanPrice} onChange={(e) => setFormData(prev => ({ ...prev, basePlanPrice: parseInt(e.target.value) || 0 }))} required disabled={isCreating || !!createSuccess} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="perUserPrice">Per User ($/mo) *</Label>
                    <Input id="perUserPrice" type="number" min="0" value={formData.perUserPrice} onChange={(e) => setFormData(prev => ({ ...prev, perUserPrice: parseInt(e.target.value) || 0 }))} required disabled={isCreating || !!createSuccess} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="includedUsers">Included Users *</Label>
                    <Input id="includedUsers" type="number" min="1" value={formData.includedUsers} onChange={(e) => setFormData(prev => ({ ...prev, includedUsers: parseInt(e.target.value) || 1 }))} required disabled={isCreating || !!createSuccess} />
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Monthly Estimate</span>
                    <span className="text-2xl font-bold">${monthlyEstimate}</span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { resetForm(); setIsAddDialogOpen(false); }} disabled={isCreating}>Cancel</Button>
              <Button type="submit" disabled={isCreating || !!createSuccess}>
                {isCreating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : createSuccess ? <><CheckCircle className="h-4 w-4 mr-2" />Created!</> : <><Plus className="h-4 w-4 mr-2" />Create Tenant</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * ConnectionStatus - Shows Twilio device connection status in the header
 */
function ConnectionStatus() {
  const callingContext = useOptionalCallingContext();

  // If no calling context, don't show anything
  if (!callingContext) {
    return null;
  }

  const { isReady, isConnecting, isReconnecting, error } = callingContext;

  // Show reconnecting state with a distinct indicator
  if (isReconnecting) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Reconnecting
      </Badge>
    );
  }

  if (error && !isReconnecting) {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <WifiOff className="h-3 w-3" />
        Error
      </Badge>
    );
  }

  if (isConnecting) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Connecting
      </Badge>
    );
  }

  if (isReady) {
    return (
      <Badge variant="default" className="gap-1 text-xs bg-green-600 hover:bg-green-700">
        <Wifi className="h-3 w-3" />
        Ready
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <WifiOff className="h-3 w-3" />
      Offline
    </Badge>
  );
}

function CustomUserButton({ roleLabel, isSuperAdmin }: { roleLabel: string | null; isSuperAdmin: boolean }) {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const initials = user.firstName && user.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() || "U";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center rounded-full overflow-hidden hover:opacity-80 transition-opacity"
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.imageUrl} alt={user.fullName || "User"} />
          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-border bg-card shadow-lg z-50">
          {/* Profile Card */}
          <div className="p-4 border-b border-border">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user.imageUrl} alt={user.fullName || "User"} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">
                  {user.fullName || "User"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.emailAddresses[0]?.emailAddress}
                </p>
                {roleLabel && (
                  <Badge variant="default" className="mt-2 gap-1 text-xs">
                    <Shield className="h-3 w-3" />
                    {roleLabel}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-1">
            {isSuperAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-md transition-colors"
              >
                <Building2 className="h-4 w-4" />
                Admin Dashboard
              </Link>
            )}
            <button
              onClick={() => {
                setOpen(false);
                openUserProfile();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-md transition-colors"
            >
              <UserCog className="h-4 w-4" />
              Manage account
            </button>
            <button
              onClick={() => signOut({ redirectUrl: "/" })}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-md transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { organization } = useOrganization();
  const router = useRouter();
  const pathname = usePathname();

  // Check if user is super_admin for showing admin link
  const isSuperAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Get platform user role for display
  const platformUser = useQuery(
    api.platformUsers.getCurrent,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const roleLabel = platformUser?.role === "super_admin" ? "Super Admin" :
                    platformUser?.role === "platform_staff" ? "Platform Staff" : null;

  // Check onboarding status for tenant users
  const onboardingStatus = useQuery(
    api.organizations.getOnboardingStatus,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Get the user's role in the current organization
  const currentOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const currentUser = useQuery(
    api.users.getByClerkId,
    user?.id && currentOrg?._id
      ? { clerkUserId: user.id, organizationId: currentOrg._id }
      : "skip"
  );

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // Redirect tenant admins to onboarding if needed
  useEffect(() => {
    // Only redirect if we have all the data we need
    if (!isLoaded || !isSignedIn || !organization) return;

    // Don't redirect if already on onboarding page
    if (pathname?.startsWith("/onboarding")) return;

    // Don't redirect platform users (super_admin, platform_staff)
    if (isSuperAdmin) return;

    // Only redirect tenant_admins who need onboarding
    if (
      currentUser?.role === "tenant_admin" &&
      onboardingStatus?.needsOnboarding
    ) {
      router.push("/onboarding");
    }
  }, [isLoaded, isSignedIn, organization, pathname, isSuperAdmin, currentUser, onboardingStatus, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  // Check if we're on onboarding pages - don't show calling features there
  const isOnboarding = pathname?.startsWith("/onboarding");

  // Always enable CallingProvider if we have an organization and not on onboarding
  // The useTwilioDevice hook will handle errors gracefully if Twilio isn't configured
  const hasCallingEnabled = Boolean(organization?.id && !isOnboarding);

  // The inner content that will be wrapped conditionally
  const layoutContent = (
    <div className="min-h-screen bg-background">
      {/* Global incoming call banner - shows on ALL pages */}
      <GlobalIncomingBanner />

      {/* Active call bar - shows mini controls when on a call but not on /dashboard */}
      <ActiveCallBar />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <span className="text-base font-semibold">VoIP CRM</span>
            </Link>
            {isSuperAdmin && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <TenantSwitcher />
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Connection status indicator */}
            <ConnectionStatus />
            <Link href="/stats">
              <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-muted transition-colors border-border/60">
                <BarChart3 className="h-3 w-3" />
                Stats
              </Badge>
            </Link>
            <Link href="/contacts">
              <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-muted transition-colors border-border/60">
                <Users className="h-3 w-3" />
                Contacts
              </Badge>
            </Link>
            <Link href="/settings">
              <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-muted transition-colors border-border/60">
                <Settings className="h-3 w-3" />
                Settings
              </Badge>
            </Link>
            <CustomUserButton roleLabel={roleLabel} isSuperAdmin={isSuperAdmin === true} />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>
    </div>
  );

  // Wrap with CallingProvider only if calling is enabled for this organization
  if (hasCallingEnabled && organization?.id) {
    return (
      <CallingProvider organizationId={organization.id}>
        {layoutContent}
      </CallingProvider>
    );
  }

  // Without calling features (onboarding, no Twilio setup, etc.)
  return layoutContent;
}
