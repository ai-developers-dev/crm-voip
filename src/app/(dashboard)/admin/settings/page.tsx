"use client";

import { useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Pencil, Trash2,
  ToggleLeft, ToggleRight, Shield, ChevronDown,
  Building, Users, Briefcase
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SettingsRow } from "@/components/settings/settings-row";

export default function AdminSettingsPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();

  const isSuperAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Data queries
  const agencyTypes = useQuery(api.agencyTypes.getAll);
  const allCarriers = useQuery(api.agencyCarriers.getAll);
  const allProducts = useQuery(api.agencyProducts.getAll);
  const platformUsers = useQuery(api.platformUsers.getAll);

  // Agency Type mutations
  const createAgencyType = useMutation(api.agencyTypes.create);
  const updateAgencyType = useMutation(api.agencyTypes.update);
  const toggleActiveAgencyType = useMutation(api.agencyTypes.toggleActive);
  const removeAgencyType = useMutation(api.agencyTypes.remove);

  // Carrier mutations
  const createCarrier = useMutation(api.agencyCarriers.create);
  const updateCarrier = useMutation(api.agencyCarriers.update);
  const toggleActiveCarrier = useMutation(api.agencyCarriers.toggleActive);
  const removeCarrier = useMutation(api.agencyCarriers.remove);

  // Product/LOB mutations
  const createProduct = useMutation(api.agencyProducts.create);
  const updateProduct = useMutation(api.agencyProducts.update);
  const toggleActiveProduct = useMutation(api.agencyProducts.toggleActive);
  const removeProduct = useMutation(api.agencyProducts.remove);

  // Platform User mutations
  const addPlatformUser = useMutation(api.platformUsers.addPlatformUser);
  const updatePlatformUserRole = useMutation(api.platformUsers.updateRole);
  const removePlatformUser = useMutation(api.platformUsers.remove);

  // Section expand state
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const toggleSection = (key: string) => setExpandedSection((prev) => (prev === key ? null : key));

  // Shared dialog state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Agency Type dialog
  const [agencyTypeDialog, setAgencyTypeDialog] = useState<{ mode: "add" | "edit"; item?: any } | null>(null);
  const [agencyTypeName, setAgencyTypeName] = useState("");
  const [deletingAgencyType, setDeletingAgencyType] = useState<any>(null);

  // Carrier dialog
  const [carrierDialog, setCarrierDialog] = useState<{ mode: "add" | "edit"; item?: any } | null>(null);
  const [carrierName, setCarrierName] = useState("");
  const [carrierUrl, setCarrierUrl] = useState("");
  const [carrierPortalUrl, setCarrierPortalUrl] = useState("");
  const [carrierAgencyTypeId, setCarrierAgencyTypeId] = useState("");
  const [deletingCarrier, setDeletingCarrier] = useState<any>(null);

  // Product/LOB dialog
  const [productDialog, setProductDialog] = useState<{ mode: "add" | "edit"; item?: any } | null>(null);
  const [productName, setProductName] = useState("");
  const [productCarrierIds, setProductCarrierIds] = useState<string[]>([]);
  const [deletingProduct, setDeletingProduct] = useState<any>(null);
  const [preselectedCarrierId, setPreselectedCarrierId] = useState<string | null>(null);
  const [productCoverageFields, setProductCoverageFields] = useState<
    { key: string; label: string; placeholder: string; type: string; options: string; apiFieldName: string }[]
  >([]);

  const toCamelCase = (str: string) =>
    str.trim().toLowerCase().replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase());

  // Expand/collapse state for carriers
  const [expandedCarrierIds, setExpandedCarrierIds] = useState<Set<string>>(new Set());
  const toggleExpandCarrier = (id: string) => {
    setExpandedCarrierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Group products by carrier
  const productsByCarrier = useMemo(() => {
    const map = new Map<string, typeof allProducts>();
    if (!allProducts) return map;
    for (const product of allProducts) {
      const list = map.get(product.carrierId) ?? [];
      list.push(product);
      map.set(product.carrierId, list);
    }
    return map;
  }, [allProducts]);

  // Agency Type handlers
  const openAddAgencyType = () => {
    setAgencyTypeName("");
    setAgencyTypeDialog({ mode: "add" });
  };
  const openEditAgencyType = (item: any) => {
    setAgencyTypeName(item.name);
    setAgencyTypeDialog({ mode: "edit", item });
  };
  const handleAgencyTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (agencyTypeDialog?.mode === "edit") {
        await updateAgencyType({ id: agencyTypeDialog.item._id, name: agencyTypeName });
      } else {
        await createAgencyType({ name: agencyTypeName });
      }
      setAgencyTypeDialog(null);
    } catch (error) {
      console.error("Failed to save agency type:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteAgencyType = async () => {
    if (!deletingAgencyType) return;
    setIsSubmitting(true);
    try {
      await removeAgencyType({ id: deletingAgencyType._id });
      setDeletingAgencyType(null);
    } catch (error) {
      console.error("Failed to delete agency type:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Carrier handlers
  const openAddCarrier = () => {
    setCarrierName("");
    setCarrierUrl("");
    setCarrierPortalUrl("");
    setCarrierAgencyTypeId("");
    setCarrierDialog({ mode: "add" });
  };
  const openEditCarrier = (item: any) => {
    setCarrierName(item.name);
    setCarrierUrl(item.websiteUrl ?? "");
    setCarrierPortalUrl(item.portalUrl ?? "");
    setCarrierAgencyTypeId(item.agencyTypeId);
    setCarrierDialog({ mode: "edit", item });
  };
  const handleCarrierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!carrierAgencyTypeId) return;
    setIsSubmitting(true);
    try {
      if (carrierDialog?.mode === "edit") {
        await updateCarrier({
          id: carrierDialog.item._id,
          name: carrierName,
          websiteUrl: carrierUrl.trim() || undefined,
          portalUrl: carrierPortalUrl.trim() || undefined,
        });
      } else {
        await createCarrier({
          agencyTypeId: carrierAgencyTypeId as Id<"agencyTypes">,
          name: carrierName,
          websiteUrl: carrierUrl.trim() || undefined,
          portalUrl: carrierPortalUrl.trim() || undefined,
        });
      }
      setCarrierDialog(null);
    } catch (error) {
      console.error("Failed to save carrier:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteCarrier = async () => {
    if (!deletingCarrier) return;
    setIsSubmitting(true);
    try {
      await removeCarrier({ id: deletingCarrier._id });
      setDeletingCarrier(null);
    } catch (error) {
      console.error("Failed to delete carrier:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Product/LOB handlers
  const openAddProduct = () => {
    setProductName("");
    setProductCarrierIds([]);
    setPreselectedCarrierId(null);
    setProductCoverageFields([]);
    setProductDialog({ mode: "add" });
  };
  const openAddProductForCarrier = (carrierId: string) => {
    setProductName("");
    setProductCarrierIds([carrierId]);
    setPreselectedCarrierId(carrierId);
    setProductCoverageFields([]);
    setProductDialog({ mode: "add" });
  };
  const openEditProduct = (item: any) => {
    setProductName(item.name);
    setProductCarrierIds([item.carrierId]);
    setProductCoverageFields(
      (item.coverageFields ?? []).map((f: any) => ({
        key: f.key ?? "",
        label: f.label ?? "",
        placeholder: f.placeholder ?? "",
        type: f.type ?? "text",
        options: (f.options ?? []).join(", "),
        apiFieldName: f.apiFieldName ?? "",
      }))
    );
    setProductDialog({ mode: "edit", item });
  };
  const toggleProductCarrier = (carrierId: string) => {
    setProductCarrierIds((prev) =>
      prev.includes(carrierId)
        ? prev.filter((id) => id !== carrierId)
        : [...prev, carrierId]
    );
  };
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (productCarrierIds.length === 0) return;
    setIsSubmitting(true);
    try {
      const validCoverageFields = productCoverageFields
        .filter((f) => f.label.trim())
        .map((f) => {
          const fieldType = f.type || "text";
          return {
            key: f.key || toCamelCase(f.label),
            label: f.label.trim(),
            ...(f.placeholder.trim() && { placeholder: f.placeholder.trim() }),
            ...(fieldType !== "text" && { type: fieldType as "text" | "currency" | "number" | "select" }),
            ...(fieldType === "select" && f.options.trim() && {
              options: f.options.split(",").map((o) => o.trim()).filter(Boolean),
            }),
            ...(f.apiFieldName.trim() && { apiFieldName: f.apiFieldName.trim() }),
          };
        });

      if (productDialog?.mode === "edit") {
        await updateProduct({
          id: productDialog.item._id,
          name: productName,
          coverageFields: validCoverageFields,
        });
      } else {
        // Create one product per selected carrier
        for (const carrierId of productCarrierIds) {
          const carrier = allCarriers?.find((c) => c._id === carrierId);
          if (!carrier) continue;
          await createProduct({
            agencyTypeId: carrier.agencyTypeId,
            carrierId: carrierId as Id<"agencyCarriers">,
            name: productName,
            coverageFields: validCoverageFields,
          });
        }
      }
      setProductDialog(null);
    } catch (error) {
      console.error("Failed to save line of business:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;
    setIsSubmitting(true);
    try {
      await removeProduct({ id: deletingProduct._id });
      setDeletingProduct(null);
    } catch (error) {
      console.error("Failed to delete line of business:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Platform User dialog
  const [userDialog, setUserDialog] = useState<{ mode: "add" | "edit"; item?: any } | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<"super_admin" | "platform_staff">("platform_staff");
  const [deletingUser, setDeletingUser] = useState<any>(null);

  const openAddUser = () => {
    setUserName("");
    setUserEmail("");
    setUserRole("platform_staff");
    setUserDialog({ mode: "add" });
  };
  const openEditUser = (item: any) => {
    setUserRole(item.role);
    setUserDialog({ mode: "edit", item });
  };
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setIsSubmitting(true);
    try {
      if (userDialog?.mode === "edit") {
        await updatePlatformUserRole({
          requestingUserId: user.id,
          targetUserId: userDialog.item._id,
          role: userRole,
        });
      } else {
        // For adding, we need the Clerk user ID. We'll use email to look up or create via server action.
        // For now, use a placeholder clerkUserId that will be resolved when they sign in.
        await addPlatformUser({
          requestingUserId: user.id,
          clerkUserId: `pending_${userEmail}`,
          email: userEmail,
          name: userName,
          role: userRole,
        });
      }
      setUserDialog(null);
    } catch (error: any) {
      console.error("Failed to save platform user:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteUser = async () => {
    if (!deletingUser || !user?.id) return;
    setIsSubmitting(true);
    try {
      await removePlatformUser({
        requestingUserId: user.id,
        targetUserId: deletingUser._id,
      });
      setDeletingUser(null);
    } catch (error) {
      console.error("Failed to delete platform user:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helpers
  const getAgencyTypeName = (id: Id<"agencyTypes">) =>
    agencyTypes?.find((t) => t._id === id)?.name ?? "---";
  const getCarrierName = (id: Id<"agencyCarriers">) =>
    allCarriers?.find((c) => c._id === id)?.name ?? "---";

  if (!userLoaded || isSuperAdmin === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only super admins can access platform settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Platform Settings</h1>
        <p className="text-sm text-muted-foreground">Manage agency types, carriers, and lines of business</p>
      </div>

      {/* Settings Rows */}
      <div className="space-y-2">

        {/* ====== AGENCY TYPES ====== */}
        <SettingsRow
          icon={<Building className="h-4 w-4 text-orange-600" />}
          label="Agency Types"
          summary={`${agencyTypes?.length ?? 0} types`}
          action={
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openAddAgencyType}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          }
          isExpanded={expandedSection === "agency-types"}
          onToggle={() => toggleSection("agency-types")}
        >
          {agencyTypes === undefined ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : agencyTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No agency types yet.</p>
          ) : (
            <div className="space-y-0.5">
              {agencyTypes.map((type) => (
                <div key={type._id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 group -mx-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{type.name}</span>
                    <Badge variant={type.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 shrink-0">
                      {type.isActive ? "Active" : "Off"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditAgencyType(type)}><Pencil className="h-2.5 w-2.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleActiveAgencyType({ id: type._id })}>{type.isActive ? <ToggleRight className="h-2.5 w-2.5" /> : <ToggleLeft className="h-2.5 w-2.5" />}</Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeletingAgencyType(type)}><Trash2 className="h-2.5 w-2.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SettingsRow>

        {/* ====== CARRIERS & LINES OF BUSINESS ====== */}
        <SettingsRow
          icon={<Briefcase className="h-4 w-4 text-purple-600" />}
          label="Carriers & LOB"
          summary={`${allCarriers?.length ?? 0} carriers`}
          action={
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openAddCarrier} disabled={!agencyTypes || agencyTypes.length === 0}>
              <Plus className="h-3 w-3 mr-1" />
              Add Carrier
            </Button>
          }
          isExpanded={expandedSection === "carriers"}
          onToggle={() => toggleSection("carriers")}
        >
          {allCarriers === undefined ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : allCarriers.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No carriers yet. Add an agency type first, then add carriers.</p>
          ) : (
            <div className="space-y-px">
              {allCarriers.map((carrier) => {
                const isExpanded = expandedCarrierIds.has(carrier._id);
                const carrierProducts = productsByCarrier.get(carrier._id) ?? [];
                return (
                  <div key={carrier._id}>
                    <div
                      className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50 group cursor-pointer -mx-2"
                      onClick={() => toggleExpandCarrier(carrier._id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`} />
                        <span className="text-sm font-medium truncate">{carrier.name}</span>
                        <Badge variant={carrier.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 shrink-0">
                          {carrier.isActive ? "Active" : "Off"}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground shrink-0">{carrierProducts.length} LOB</span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditCarrier(carrier)}><Pencil className="h-2.5 w-2.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleActiveCarrier({ id: carrier._id })}>{carrier.isActive ? <ToggleRight className="h-2.5 w-2.5" /> : <ToggleLeft className="h-2.5 w-2.5" />}</Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeletingCarrier(carrier)}><Trash2 className="h-2.5 w-2.5" /></Button>
                      </div>
                    </div>
                    <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}>
                      <div className="ml-4 pl-4 py-1 space-y-px border-l-2 border-border/50">
                        {carrierProducts.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 px-2">No lines of business yet.</p>
                        ) : (
                          carrierProducts.map((product) => {
                            const fieldCount = (product as any).coverageFields?.length ?? 0;
                            return (
                              <div key={product._id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30 group/lob">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm truncate">{product.name}</span>
                                  <Badge variant={product.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 shrink-0">
                                    {product.isActive ? "Active" : "Off"}
                                  </Badge>
                                  {fieldCount > 0 && (
                                    <span className="text-[10px] text-muted-foreground shrink-0">{fieldCount} {fieldCount === 1 ? "field" : "fields"}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover/lob:opacity-100 transition-opacity shrink-0">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditProduct(product)}><Pencil className="h-2.5 w-2.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleActiveProduct({ id: product._id })}>{product.isActive ? <ToggleRight className="h-2.5 w-2.5" /> : <ToggleLeft className="h-2.5 w-2.5" />}</Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeletingProduct(product)}><Trash2 className="h-2.5 w-2.5" /></Button>
                                </div>
                              </div>
                            );
                          })
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-muted-foreground"
                          onClick={() => openAddProductForCarrier(carrier._id)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add LOB
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SettingsRow>

        {/* ====== PLATFORM USERS ====== */}
        <SettingsRow
          icon={<Users className="h-4 w-4 text-blue-600" />}
          label="Platform Users"
          summary={`${platformUsers?.length ?? 0} users`}
          action={
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openAddUser}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          }
          isExpanded={expandedSection === "platform-users"}
          onToggle={() => toggleSection("platform-users")}
        >
          {platformUsers === undefined ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : platformUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No platform users found.</p>
          ) : (
            <div className="space-y-0.5">
              {platformUsers.map((pu) => {
                const isCurrentUser = pu.clerkUserId === user?.id;
                return (
                  <div key={pu._id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 group -mx-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {pu.name}
                          {isCurrentUser && <span className="text-[10px] text-muted-foreground ml-1">(you)</span>}
                        </span>
                        <Badge variant={pu.role === "super_admin" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 gap-0.5 shrink-0">
                          {pu.role === "super_admin" && <Shield className="h-2.5 w-2.5" />}
                          {pu.role === "super_admin" ? "Admin" : "User"}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate block">{pu.email}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditUser(pu)} disabled={isCurrentUser}><Pencil className="h-2.5 w-2.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeletingUser(pu)} disabled={isCurrentUser}><Trash2 className="h-2.5 w-2.5" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SettingsRow>

      </div>{/* end settings rows */}

      {/* ====== DIALOGS ====== */}

      {/* Agency Type Add/Edit */}
      <Dialog open={!!agencyTypeDialog} onOpenChange={(open) => { if (!open) setAgencyTypeDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{agencyTypeDialog?.mode === "edit" ? "Edit Agency Type" : "Add Agency Type"}</DialogTitle>
            <DialogDescription>Enter the name for this agency type.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAgencyTypeSubmit}>
            <div className="py-4">
              <Label htmlFor="agencyTypeName">Name *</Label>
              <Input
                id="agencyTypeName"
                placeholder="e.g., Insurance Agency"
                value={agencyTypeName}
                onChange={(e) => setAgencyTypeName(e.target.value)}
                required
                disabled={isSubmitting}
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAgencyTypeDialog(null)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || !agencyTypeName.trim()}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {agencyTypeDialog?.mode === "edit" ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Agency Type Delete */}
      <Dialog open={!!deletingAgencyType} onOpenChange={(open) => { if (!open) setDeletingAgencyType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agency Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingAgencyType?.name}</strong>? This will also delete all associated carriers, lines of business, and commission rates.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingAgencyType(null)} disabled={isSubmitting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAgencyType} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carrier Add/Edit */}
      <Dialog open={!!carrierDialog} onOpenChange={(open) => { if (!open) setCarrierDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{carrierDialog?.mode === "edit" ? "Edit Carrier" : "Add Carrier"}</DialogTitle>
            <DialogDescription>Enter the carrier name and select its agency type.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCarrierSubmit}>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="carrierName">Name *</Label>
                <Input
                  id="carrierName"
                  placeholder="e.g., State Farm"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="carrierUrl">Website URL</Label>
                <Input
                  id="carrierUrl"
                  type="url"
                  placeholder="https://www.carrier.com"
                  value={carrierUrl}
                  onChange={(e) => setCarrierUrl(e.target.value)}
                  disabled={isSubmitting}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="carrierPortalUrl">Agent Portal URL</Label>
                <Input
                  id="carrierPortalUrl"
                  type="url"
                  placeholder="https://agent.carrier.com"
                  value={carrierPortalUrl}
                  onChange={(e) => setCarrierPortalUrl(e.target.value)}
                  disabled={isSubmitting}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">Clicking carrier in policies will open this URL and copy the policy number</p>
              </div>
              {carrierDialog?.mode !== "edit" && (
                <div>
                  <Label>Agency Type *</Label>
                  <Select value={carrierAgencyTypeId} onValueChange={setCarrierAgencyTypeId}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select agency type" />
                    </SelectTrigger>
                    <SelectContent>
                      {agencyTypes?.filter((t) => t.isActive).map((type) => (
                        <SelectItem key={type._id} value={type._id}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCarrierDialog(null)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || !carrierName.trim() || !carrierAgencyTypeId}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {carrierDialog?.mode === "edit" ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Carrier Delete */}
      <Dialog open={!!deletingCarrier} onOpenChange={(open) => { if (!open) setDeletingCarrier(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Carrier</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingCarrier?.name}</strong>? This will also delete all associated lines of business and commission rates.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCarrier(null)} disabled={isSubmitting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCarrier} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product/LOB Add/Edit */}
      <Dialog open={!!productDialog} onOpenChange={(open) => { if (!open) { setProductDialog(null); setPreselectedCarrierId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{productDialog?.mode === "edit" ? "Edit Line of Business" : "Add Line of Business"}</DialogTitle>
            <DialogDescription>
              {productDialog?.mode === "edit"
                ? "Update the line of business name."
                : preselectedCarrierId
                  ? `Add a line of business to ${getCarrierName(preselectedCarrierId as Id<"agencyCarriers">)}.`
                  : "Enter the name and select a carrier."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleProductSubmit}>
            <div className="space-y-4 py-4 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
              <div>
                <Label htmlFor="productName">Name *</Label>
                <Input
                  id="productName"
                  placeholder="e.g., Auto Insurance"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="mt-2"
                />
              </div>
              {productDialog?.mode !== "edit" && !preselectedCarrierId && (
                <div>
                  <Label>Carrier *</Label>
                  <Select value={productCarrierIds[0] ?? ""} onValueChange={(v) => setProductCarrierIds([v])}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      {allCarriers?.filter((c) => c.isActive).map((carrier) => (
                        <SelectItem key={carrier._id} value={carrier._id}>
                          {carrier.name} ({getAgencyTypeName(carrier.agencyTypeId)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Coverage Fields Editor */}
              <div>
                <Label>Coverage Fields</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Define the coverage inputs agents will fill out for this line of business.
                </p>
                <div className="space-y-3">
                  {productCoverageFields.map((field, i) => (
                    <div key={i} className="space-y-1.5 rounded-md border border-border/60 p-2.5">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Label (e.g., Collision Deductible)"
                          value={field.label}
                          onChange={(e) => {
                            const updated = [...productCoverageFields];
                            updated[i] = { ...field, label: e.target.value, key: toCamelCase(e.target.value) };
                            setProductCoverageFields(updated);
                          }}
                          disabled={isSubmitting}
                          className="flex-1"
                        />
                        <Select
                          value={field.type || "text"}
                          onValueChange={(v) => {
                            const updated = [...productCoverageFields];
                            updated[i] = { ...field, type: v };
                            setProductCoverageFields(updated);
                          }}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="currency">Currency</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="select">Select</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setProductCoverageFields((f) => f.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        {field.type === "select" ? (
                          <Input
                            placeholder="Options (comma-separated, e.g., $250, $500, $1000)"
                            value={field.options}
                            onChange={(e) => {
                              const updated = [...productCoverageFields];
                              updated[i] = { ...field, options: e.target.value };
                              setProductCoverageFields(updated);
                            }}
                            disabled={isSubmitting}
                            className="flex-1"
                          />
                        ) : (
                          <Input
                            placeholder="Placeholder (e.g., $500)"
                            value={field.placeholder}
                            onChange={(e) => {
                              const updated = [...productCoverageFields];
                              updated[i] = { ...field, placeholder: e.target.value };
                              setProductCoverageFields(updated);
                            }}
                            disabled={isSubmitting}
                            className="flex-1"
                          />
                        )}
                        <Input
                          placeholder="API field name"
                          value={field.apiFieldName}
                          onChange={(e) => {
                            const updated = [...productCoverageFields];
                            updated[i] = { ...field, apiFieldName: e.target.value };
                            setProductCoverageFields(updated);
                          }}
                          disabled={isSubmitting}
                          className="w-32"
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setProductCoverageFields((f) => [...f, { key: "", label: "", placeholder: "", type: "text", options: "", apiFieldName: "" }])}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Coverage Field
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setProductDialog(null); setPreselectedCarrierId(null); }} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || !productName.trim() || productCarrierIds.length === 0}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {productDialog?.mode === "edit" ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product/LOB Delete */}
      <Dialog open={!!deletingProduct} onOpenChange={(open) => { if (!open) setDeletingProduct(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Line of Business</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingProduct?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingProduct(null)} disabled={isSubmitting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProduct} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Platform User Add/Edit */}
      <Dialog open={!!userDialog} onOpenChange={(open) => { if (!open) setUserDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{userDialog?.mode === "edit" ? "Edit User Role" : "Add Platform User"}</DialogTitle>
            <DialogDescription>
              {userDialog?.mode === "edit"
                ? `Change role for ${userDialog.item?.name}.`
                : "Add a new admin or user to the platform."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUserSubmit}>
            <div className="space-y-4 py-4">
              {userDialog?.mode !== "edit" && (
                <>
                  <div>
                    <Label htmlFor="userName">Name *</Label>
                    <Input
                      id="userName"
                      placeholder="John Smith"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="userEmail">Email *</Label>
                    <Input
                      id="userEmail"
                      type="email"
                      placeholder="john@example.com"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="mt-2"
                    />
                  </div>
                </>
              )}
              <div>
                <Label>Role *</Label>
                <Select value={userRole} onValueChange={(v) => setUserRole(v as "super_admin" | "platform_staff")}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Admin</SelectItem>
                    <SelectItem value="platform_staff">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUserDialog(null)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || (userDialog?.mode !== "edit" && (!userName.trim() || !userEmail.trim()))}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {userDialog?.mode === "edit" ? "Save" : "Add User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Platform User Delete */}
      <Dialog open={!!deletingUser} onOpenChange={(open) => { if (!open) setDeletingUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Platform User</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{deletingUser?.name}</strong> ({deletingUser?.email}) from the platform?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingUser(null)} disabled={isSubmitting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
