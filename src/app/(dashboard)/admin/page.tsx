"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2, Users, Phone, Activity, Loader2, Plus, CreditCard,
  CheckCircle, Clock, AlertCircle, XCircle, MapPin, Mail, DollarSign,
  TrendingUp, BarChart3, ArrowRight, MessageSquare, Calendar,
  Workflow, Columns3, BrainCircuit,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTenant } from "./actions";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge variant="default" className="gap-1 text-[10px]"><CheckCircle className="h-3 w-3" />Active</Badge>;
    case "trialing":
      return <Badge className="gap-1 text-[10px] bg-blue-500/15 text-blue-600 border-blue-500/30"><Clock className="h-3 w-3" />Trial</Badge>;
    case "past_due":
      return <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />Past Due</Badge>;
    case "canceled":
      return <Badge variant="secondary" className="gap-1 text-[10px]"><XCircle className="h-3 w-3" />Canceled</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">No Plan</Badge>;
  }
}

export default function AdminDashboardPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    businessName: "", streetAddress: "", city: "", state: "", zip: "",
    phone: "", ownerName: "", ownerEmail: "",
    basePlanPrice: 97, perUserPrice: 47, includedUsers: 1,
  });

  // Selected tenant for detail popup
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

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

  const isSuperAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );
  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );
  const tenants = useQuery(api.organizations.getAllTenants);

  // Revenue summary for current month
  const now = new Date();
  const revenue = useQuery(api.usageInvoices.getRevenueSummary, {
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  if (!userLoaded || isSuperAdmin === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You don't have permission to access the admin dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeCount = tenants?.filter((t: any) => (t.billing as any)?.subscriptionStatus === "active").length ?? 0;
  const trialCount = tenants?.filter((t: any) => (t.billing as any)?.subscriptionStatus === "trialing").length ?? 0;
  const pastDueCount = tenants?.filter((t: any) => (t.billing as any)?.subscriptionStatus === "past_due").length ?? 0;

  const selectedTenant = tenants?.find((t: any) => t._id === selectedTenantId);

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-on-surface-variant font-medium">Tenants</p>
              <Building2 className="h-4 w-4 text-on-surface-variant" />
            </div>
            <p className="text-2xl font-bold mt-1">{tenants?.length ?? 0}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] text-green-600">{activeCount} active</span>
              <span className="text-[10px] text-blue-600">{trialCount} trial</span>
              {pastDueCount > 0 && <span className="text-[10px] text-destructive">{pastDueCount} past due</span>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-on-surface-variant font-medium">Subscription MRR</p>
              <DollarSign className="h-4 w-4 text-on-surface-variant" />
            </div>
            <p className="text-2xl font-bold mt-1">{revenue ? formatCents(revenue.totalMrrCents) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-on-surface-variant font-medium">Usage Revenue</p>
              <TrendingUp className="h-4 w-4 text-on-surface-variant" />
            </div>
            <p className="text-2xl font-bold mt-1">{revenue ? formatCents(revenue.totalUsageChargedCents) : "—"}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">
              Profit: {revenue ? formatCents(revenue.totalProfitCents) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-on-surface-variant font-medium">Total Revenue</p>
              <BarChart3 className="h-4 w-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600 mt-1">{revenue ? formatCents(revenue.totalRevenueCents) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Cards */}
      <div>
        <h2 className="text-sm font-extrabold mb-3">All Tenants</h2>
        {!tenants ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" /></div>
        ) : tenants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-10 w-10 text-on-surface-variant mx-auto mb-3" />
              <p className="text-sm font-medium">No tenants yet</p>
              <Button size="sm" className="mt-3" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />Create First Tenant
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tenants.map((tenant: any) => {
              const billing = tenant.billing as any;
              const status = billing?.subscriptionStatus || "none";
              const basePlan = billing?.basePlanPrice || 0;
              const perUser = billing?.perUserPrice || 0;
              const statusDot = status === "active" ? "bg-green-500" : status === "trialing" ? "bg-blue-500" : status === "past_due" ? "bg-red-500" : "bg-gray-400";
              const initials = tenant.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

              return (
                <Card
                  key={tenant._id}
                  className="cursor-pointer transition-all duration-200"
                  onClick={() => setSelectedTenantId(tenant._id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar with status dot */}
                      <div className="relative shrink-0">
                        <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                          <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${statusDot}`} />
                      </div>

                      {/* Name and status */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{tenant.name}</p>
                        <StatusBadge status={status} />
                      </div>

                      {/* Metrics */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                          <DollarSign className="h-3.5 w-3.5" />
                          <span>{basePlan}/mo</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                          <Users className="h-3.5 w-3.5" />
                          <span>${perUser}/user</span>
                        </div>
                        <Link
                          href={`/admin/tenants/${tenant._id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                            Manage <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Tenant Detail Popup */}
      <Dialog open={!!selectedTenantId} onOpenChange={(open) => { if (!open) setSelectedTenantId(null); }}>
        {selectedTenant && <TenantDetailContent tenant={selectedTenant} onClose={() => setSelectedTenantId(null)} />}
      </Dialog>

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
            <div className="pt-3">
              <h4 className="text-xs font-bold mb-2">Billing</h4>
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

// ── Tenant Detail Popup (Editable) ────────────────────────────────────
function TenantDetailContent({ tenant, onClose }: { tenant: any; onClose: () => void }) {
  const billing = tenant.billing as any;
  const biz = tenant.businessInfo || {};
  const status = billing?.subscriptionStatus || "none";

  const updateTenant = useMutation(api.organizations.updateTenantDetails);
  const invoices = useQuery(api.usageInvoices.getByOrganization, { organizationId: tenant._id as Id<"organizations"> });
  const users = useQuery(api.users.getByOrganization, { organizationId: tenant._id as Id<"organizations"> });
  const allAddons = useQuery(api.pricing.getAllAddons);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable form state
  const [form, setForm] = useState({
    name: tenant.name || "",
    ownerName: biz.ownerName || "",
    ownerEmail: biz.ownerEmail || "",
    phone: biz.phone || "",
    streetAddress: biz.streetAddress || "",
    city: biz.city || "",
    state: biz.state || "",
    zip: biz.zip || "",
    basePlanPrice: billing?.basePlanPrice || 97,
    perUserPrice: billing?.perUserPrice || 47,
    includedUsers: billing?.includedUsers || 1,
    billingEmail: billing?.billingEmail || "",
    enabledAddons: billing?.enabledAddons || [] as string[],
  });

  const userCount = users?.length ?? 0;
  const additionalUsers = Math.max(0, userCount - form.includedUsers);
  const subscriptionTotal = form.basePlanPrice + additionalUsers * form.perUserPrice;
  const latestInvoice = invoices?.[0];

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateTenant({
        organizationId: tenant._id as Id<"organizations">,
        name: form.name,
        businessInfo: {
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          phone: form.phone,
          streetAddress: form.streetAddress,
          city: form.city,
          state: form.state,
          zip: form.zip,
        },
        billing: {
          basePlanPrice: form.basePlanPrice,
          perUserPrice: form.perUserPrice,
          includedUsers: form.includedUsers,
          billingEmail: form.billingEmail || undefined,
          enabledAddons: form.enabledAddons,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to update tenant:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          Edit Tenant
          <StatusBadge status={status} />
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Business Info */}
        <div>
          <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">Business Info</h4>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Business Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 text-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Owner Name</Label>
                <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Owner Email</Label>
                <Input value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} className="h-9 text-sm mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-9 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Street Address</Label>
              <Input value={form.streetAddress} onChange={(e) => setForm({ ...form, streetAddress: e.target.value })} className="h-9 text-sm mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} maxLength={2} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">ZIP</Label>
                <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className="h-9 text-sm mt-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Plan & Billing */}
        <div className="pt-3">
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">Plan & Billing</h4>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Base Price ($/mo)</Label>
              <Input type="number" min={0} value={form.basePlanPrice} onChange={(e) => setForm({ ...form, basePlanPrice: Number(e.target.value) })} className="h-9 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Per User ($/mo)</Label>
              <Input type="number" min={0} value={form.perUserPrice} onChange={(e) => setForm({ ...form, perUserPrice: Number(e.target.value) })} className="h-9 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Included Users</Label>
              <Input type="number" min={1} value={form.includedUsers} onChange={(e) => setForm({ ...form, includedUsers: Number(e.target.value) })} className="h-9 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Billing Email</Label>
              <Input value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} placeholder="billing@" className="h-9 text-sm mt-1" />
            </div>
          </div>

          {/* Feature Add-Ons */}
          {allAddons && allAddons.length > 0 && (
            <div className="mt-3">
              <Label className="text-xs font-semibold">Features & Add-Ons</Label>
              <p className="text-[10px] text-on-surface-variant mb-2">Toggle features on/off for this tenant.</p>
              <div className="space-y-1">
                {allAddons.map((addon: any) => {
                  const isEnabled = addon.isIncludedInBase || form.enabledAddons.includes(addon.featureKey);
                  const isIncluded = addon.isIncludedInBase;

                  return (
                    <label
                      key={addon._id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                        isEnabled ? "bg-primary/5 border-primary/30" : "opacity-60"
                      }`}
                    >
                      <Checkbox
                        checked={isEnabled}
                        disabled={isIncluded}
                        onCheckedChange={(checked) => {
                          if (isIncluded) return;
                          setForm({
                            ...form,
                            enabledAddons: checked
                              ? [...form.enabledAddons, addon.featureKey]
                              : form.enabledAddons.filter((k: string) => k !== addon.featureKey),
                          });
                        }}
                      />
                      <span className="text-sm font-medium flex-1">{addon.name}</span>
                      {isIncluded ? (
                        <span className="text-xs text-green-600">Included</span>
                      ) : addon.priceMonthly > 0 ? (
                        <span className="text-xs font-semibold text-primary">${addon.priceMonthly}/mo</span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">Free</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cost Summary */}
          {(() => {
            const addonTotal = (allAddons || [])
              .filter((a: any) => !a.isIncludedInBase && form.enabledAddons.includes(a.featureKey))
              .reduce((sum: number, a: any) => sum + (a.priceMonthly || 0), 0);

            return (
              <div className="mt-3 p-3 rounded-2xl bg-surface-container/50 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Base plan ({form.includedUsers} user{form.includedUsers !== 1 ? "s" : ""} included)</span>
                  <span className="font-medium">${form.basePlanPrice}/mo</span>
                </div>
                {additionalUsers > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>{additionalUsers} extra user{additionalUsers !== 1 ? "s" : ""} x ${form.perUserPrice}</span>
                    <span>${additionalUsers * form.perUserPrice}/mo</span>
                  </div>
                )}
                {addonTotal > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Add-ons ({form.enabledAddons.length} features)</span>
                    <span>${addonTotal}/mo</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold pt-1">
                  <span>Subscription total</span>
                  <span>${subscriptionTotal + addonTotal}/mo</span>
                </div>
                <div className="text-xs text-on-surface-variant">{userCount} user{userCount !== 1 ? "s" : ""} · Usage billed separately</div>
              </div>
            );
          })()}
        </div>

        {/* Usage Invoice */}
        {latestInvoice && (
          <div className="pt-3">
            <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">
              Latest Usage — {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][latestInvoice.month]} {latestInvoice.year}
            </h4>
            <div className="rounded-2xl overflow-hidden text-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container/50 text-xs">
                    <th className="text-left font-medium px-3 py-1.5">Provider</th>
                    <th className="text-right font-medium px-3 py-1.5">Usage</th>
                    <th className="text-right font-medium px-3 py-1.5">Cost</th>
                    <th className="text-right font-medium px-3 py-1.5">Markup</th>
                    <th className="text-right font-medium px-3 py-1.5">Charged</th>
                    <th className="text-right font-medium px-3 py-1.5">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-3 py-1.5 font-medium">Twilio</td>
                    <td className="px-3 py-1.5 text-right text-on-surface-variant text-xs">{latestInvoice.twilioCallMinutes}m / {latestInvoice.twilioSmsSent} SMS</td>
                    <td className="px-3 py-1.5 text-right">{formatCents(latestInvoice.twilioCostCents)}</td>
                    <td className="px-3 py-1.5 text-right text-on-surface-variant">{latestInvoice.twilioMarkupPercent}%</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCents(latestInvoice.twilioChargedCents)}</td>
                    <td className="px-3 py-1.5 text-right text-green-600">{formatCents(latestInvoice.twilioChargedCents - latestInvoice.twilioCostCents)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-3 py-1.5 font-medium">AI Voice</td>
                    <td className="px-3 py-1.5 text-right text-on-surface-variant text-xs">{latestInvoice.retellCallCount} calls</td>
                    <td className="px-3 py-1.5 text-right">{formatCents(latestInvoice.retellCostCents)}</td>
                    <td className="px-3 py-1.5 text-right text-on-surface-variant">{latestInvoice.retellMarkupPercent}%</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCents(latestInvoice.retellChargedCents)}</td>
                    <td className="px-3 py-1.5 text-right text-green-600">{formatCents(latestInvoice.retellChargedCents - latestInvoice.retellCostCents)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-3 py-1.5 font-medium">AI SMS</td>
                    <td className="px-3 py-1.5 text-right text-on-surface-variant text-xs">{latestInvoice.openaiConversations} convos</td>
                    <td className="px-3 py-1.5 text-right">{formatCents(latestInvoice.openaiCostCents)}</td>
                    <td className="px-3 py-1.5 text-right text-on-surface-variant">{latestInvoice.openaiMarkupPercent}%</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCents(latestInvoice.openaiChargedCents)}</td>
                    <td className="px-3 py-1.5 text-right text-green-600">{formatCents(latestInvoice.openaiChargedCents - latestInvoice.openaiCostCents)}</td>
                  </tr>
                  <tr className="border-t bg-surface-container/30 font-semibold">
                    <td className="px-3 py-2" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-right">{formatCents(latestInvoice.totalCostCents)}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right">{formatCents(latestInvoice.totalChargedCents)}</td>
                    <td className="px-3 py-2 text-right text-green-600">{formatCents(latestInvoice.profitCents)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Monthly Summary */}
        <div className="pt-3">
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">Revenue Summary</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Subscription</span><span className="font-medium">${subscriptionTotal}/mo</span></div>
            <div className="flex justify-between"><span>Usage charges</span><span className="font-medium">{latestInvoice ? formatCents(latestInvoice.totalChargedCents) : "$0.00"}</span></div>
            <div className="flex justify-between font-bold pt-1 text-primary">
              <span>Total monthly</span>
              <span>${(subscriptionTotal + (latestInvoice ? latestInvoice.totalChargedCents / 100 : 0)).toFixed(2)}/mo</span>
            </div>
          </div>
        </div>

        {/* Save + Actions */}
        <div className="pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
            {saved && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle className="h-4 w-4" />Saved!</span>}
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/tenants/${tenant._id}`}>
              <Button variant="outline" size="sm">Manage</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/settings`}>
              <Button variant="outline" size="sm">Settings</Button>
            </Link>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
