"use client";

import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2, Plus, Pencil, Trash2, ChevronRight,
  Building2, Truck, FileText, ToggleLeft, ToggleRight, Users, Shield
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

  // Shared dialog state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Agency Type dialog
  const [agencyTypeDialog, setAgencyTypeDialog] = useState<{ mode: "add" | "edit"; item?: any } | null>(null);
  const [agencyTypeName, setAgencyTypeName] = useState("");
  const [deletingAgencyType, setDeletingAgencyType] = useState<any>(null);

  // Carrier dialog
  const [carrierDialog, setCarrierDialog] = useState<{ mode: "add" | "edit"; item?: any } | null>(null);
  const [carrierName, setCarrierName] = useState("");
  const [carrierAgencyTypeId, setCarrierAgencyTypeId] = useState("");
  const [deletingCarrier, setDeletingCarrier] = useState<any>(null);

  // Product/LOB dialog
  const [productDialog, setProductDialog] = useState<{ mode: "add" | "edit"; item?: any } | null>(null);
  const [productName, setProductName] = useState("");
  const [productCarrierId, setProductCarrierId] = useState("");
  const [deletingProduct, setDeletingProduct] = useState<any>(null);

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
    setCarrierAgencyTypeId("");
    setCarrierDialog({ mode: "add" });
  };
  const openEditCarrier = (item: any) => {
    setCarrierName(item.name);
    setCarrierAgencyTypeId(item.agencyTypeId);
    setCarrierDialog({ mode: "edit", item });
  };
  const handleCarrierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!carrierAgencyTypeId) return;
    setIsSubmitting(true);
    try {
      if (carrierDialog?.mode === "edit") {
        await updateCarrier({ id: carrierDialog.item._id, name: carrierName });
      } else {
        await createCarrier({
          agencyTypeId: carrierAgencyTypeId as Id<"agencyTypes">,
          name: carrierName,
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
    setProductCarrierId("");
    setProductDialog({ mode: "add" });
  };
  const openEditProduct = (item: any) => {
    setProductName(item.name);
    setProductCarrierId(item.carrierId);
    setProductDialog({ mode: "edit", item });
  };
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productCarrierId) return;
    setIsSubmitting(true);
    try {
      if (productDialog?.mode === "edit") {
        await updateProduct({ id: productDialog.item._id, name: productName });
      } else {
        // Look up the carrier to get its agencyTypeId
        const carrier = allCarriers?.find((c) => c._id === productCarrierId);
        if (!carrier) return;
        await createProduct({
          agencyTypeId: carrier.agencyTypeId,
          carrierId: productCarrierId as Id<"agencyCarriers">,
          name: productName,
        });
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
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center p-4">
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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground transition-colors">
          Admin
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">Platform Settings</span>
      </nav>

      <div>
        <h1 className="text-3xl font-bold">Platform Settings</h1>
        <p className="text-muted-foreground">Manage agency types, carriers, and lines of business</p>
      </div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ====== AGENCY TYPES ====== */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Agency Types</CardTitle>
                  <CardDescription className="text-xs">Business categories</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={openAddAgencyType}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {agencyTypes === undefined ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : agencyTypes.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No agency types yet.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {agencyTypes.map((type) => {
                  const carrierCount = allCarriers?.filter((c) => c.agencyTypeId === type._id).length ?? 0;
                  return (
                    <div key={type._id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium text-sm truncate">{type.name}</span>
                        <Badge variant={type.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {type.isActive ? "Active" : "Off"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{carrierCount} carriers</span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAgencyType(type)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActiveAgencyType({ id: type._id })}>{type.isActive ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}</Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingAgencyType(type)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ====== CARRIERS ====== */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                  <Truck className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Carriers</CardTitle>
                  <CardDescription className="text-xs">Associated to agency types</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={openAddCarrier} disabled={!agencyTypes || agencyTypes.length === 0}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {allCarriers === undefined ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : allCarriers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No carriers yet.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {allCarriers.map((carrier) => {
                  const lobCount = allProducts?.filter((p) => p.carrierId === carrier._id).length ?? 0;
                  return (
                    <div key={carrier._id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium text-sm truncate">{carrier.name}</span>
                        <Badge variant={carrier.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {carrier.isActive ? "Active" : "Off"}
                        </Badge>
                        <span className="text-xs text-muted-foreground truncate">{getAgencyTypeName(carrier.agencyTypeId)}</span>
                        <span className="text-xs text-muted-foreground">{lobCount} LOB</span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCarrier(carrier)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActiveCarrier({ id: carrier._id })}>{carrier.isActive ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}</Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingCarrier(carrier)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ====== LINES OF BUSINESS ====== */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                  <FileText className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Lines of Business</CardTitle>
                  <CardDescription className="text-xs">Associated to carriers</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={openAddProduct} disabled={!allCarriers || allCarriers.length === 0}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {allProducts === undefined ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : allProducts.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No lines of business yet.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {allProducts.map((product) => (
                  <div key={product._id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-sm truncate">{product.name}</span>
                      <Badge variant={product.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                        {product.isActive ? "Active" : "Off"}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">{getCarrierName(product.carrierId)}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditProduct(product)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActiveProduct({ id: product._id })}>{product.isActive ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingProduct(product)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ====== PLATFORM USERS ====== */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
                  <Users className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Platform Users</CardTitle>
                  <CardDescription className="text-xs">Admins & staff</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={openAddUser}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {platformUsers === undefined ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : platformUsers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No platform users found.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {platformUsers.map((pu) => {
                  const isCurrentUser = pu.clerkUserId === user?.id;
                  return (
                    <div key={pu._id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <span className="font-medium text-sm truncate block">
                            {pu.name}
                            {isCurrentUser && <span className="text-[10px] text-muted-foreground ml-1">(you)</span>}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block">{pu.email}</span>
                        </div>
                        <Badge variant={pu.role === "super_admin" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 gap-0.5 shrink-0">
                          {pu.role === "super_admin" && <Shield className="h-2.5 w-2.5" />}
                          {pu.role === "super_admin" ? "Admin" : "User"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditUser(pu)} disabled={isCurrentUser}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingUser(pu)} disabled={isCurrentUser}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>{/* end grid */}

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
      <Dialog open={!!productDialog} onOpenChange={(open) => { if (!open) setProductDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{productDialog?.mode === "edit" ? "Edit Line of Business" : "Add Line of Business"}</DialogTitle>
            <DialogDescription>Enter the name and select its carrier.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleProductSubmit}>
            <div className="space-y-4 py-4">
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
              {productDialog?.mode !== "edit" && (
                <div>
                  <Label>Carrier *</Label>
                  <Select value={productCarrierId} onValueChange={setProductCarrierId}>
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProductDialog(null)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || !productName.trim() || !productCarrierId}>
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
