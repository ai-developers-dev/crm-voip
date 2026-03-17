"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Building2, Users, Phone, Activity, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createTenant } from "./actions";

export default function AdminDashboardPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();

  // New tenant dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    businessName: "", streetAddress: "", city: "", state: "", zip: "",
    phone: "", ownerName: "", ownerEmail: "",
    basePlanPrice: 97, perUserPrice: 47, includedUsers: 1,
  });

  const handleCreateTenant = async () => {
    if (!formData.businessName || !formData.ownerEmail) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const result = await createTenant(formData);
      if (result.success) {
        setIsAddOpen(false);
        setFormData({
          businessName: "", streetAddress: "", city: "", state: "", zip: "",
          phone: "", ownerName: "", ownerEmail: "",
          basePlanPrice: 97, perUserPrice: 47, includedUsers: 1,
        });
      } else {
        setCreateError(result.error || "Failed to create tenant");
      }
    } catch (err: any) {
      setCreateError(err.message || "Failed to create tenant");
    } finally {
      setIsCreating(false);
    }
  };

  // Check if user is a platform admin
  const isSuperAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Get all tenant organizations for stats
  const tenants = useQuery(api.organizations.getAllTenants);

  if (!userLoaded || isSuperAdmin === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Only platform users can access this page
  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the admin dashboard.
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Platform Admin</h1>
          <p className="page-description">Manage your tenants and platform settings</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Tenant
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Active organizations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Across all tenants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Platform-wide
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Healthy</div>
            <p className="text-xs text-muted-foreground">
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* New Tenant Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Tenant</DialogTitle>
            <DialogDescription>Create a new tenant organization</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {createError && <p className="text-sm text-destructive">{createError}</p>}

            <div className="space-y-2">
              <Label className="text-xs">Business Name *</Label>
              <Input value={formData.businessName} onChange={(e) => setFormData({ ...formData, businessName: e.target.value })} placeholder="Acme Insurance" className="h-9 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Owner Name</Label>
                <Input value={formData.ownerName} onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })} placeholder="John Smith" className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Owner Email *</Label>
                <Input type="email" value={formData.ownerEmail} onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })} placeholder="john@acme.com" className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Street Address</Label>
              <Input value={formData.streetAddress} onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })} placeholder="123 Main St" className="h-9 text-sm" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">City</Label>
                <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Chicago" className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">State</Label>
                <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })} placeholder="IL" maxLength={2} className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">ZIP</Label>
                <Input value={formData.zip} onChange={(e) => setFormData({ ...formData, zip: e.target.value })} placeholder="60601" className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Phone</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="555-555-5555" className="h-9 text-sm" />
            </div>

            <div className="border-t pt-3">
              <h4 className="section-heading mb-2">Billing</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Base Price/mo</Label>
                  <Input type="number" value={formData.basePlanPrice} onChange={(e) => setFormData({ ...formData, basePlanPrice: Number(e.target.value) })} className="h-9 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Per User/mo</Label>
                  <Input type="number" value={formData.perUserPrice} onChange={(e) => setFormData({ ...formData, perUserPrice: Number(e.target.value) })} className="h-9 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Included Users</Label>
                  <Input type="number" value={formData.includedUsers} onChange={(e) => setFormData({ ...formData, includedUsers: Number(e.target.value) })} className="h-9 text-sm" />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTenant} disabled={!formData.businessName || !formData.ownerEmail || isCreating}>
              {isCreating ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Creating...</> : "Create Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
