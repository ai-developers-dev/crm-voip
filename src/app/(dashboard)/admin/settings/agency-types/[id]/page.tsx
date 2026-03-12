"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2, Plus, ArrowLeft, Pencil, Trash2,
  Building2, ToggleLeft, ToggleRight, Briefcase, Package, Grid3X3
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function AgencyTypeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const agencyTypeId = params.id as Id<"agencyTypes">;

  const isSuperAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const agencyType = useQuery(api.agencyTypes.getById, { id: agencyTypeId });
  const carriers = useQuery(api.agencyCarriers.getByAgencyType, { agencyTypeId });
  const products = useQuery(api.agencyProducts.getByAgencyType, { agencyTypeId });
  const commissions = useQuery(api.carrierCommissions.getByAgencyType, { agencyTypeId });
  const tenants = useQuery(api.organizations.getAllTenants);

  const createCarrier = useMutation(api.agencyCarriers.create);
  const updateCarrier = useMutation(api.agencyCarriers.update);
  const toggleCarrier = useMutation(api.agencyCarriers.toggleActive);
  const removeCarrier = useMutation(api.agencyCarriers.remove);

  const createProduct = useMutation(api.agencyProducts.create);
  const updateProduct = useMutation(api.agencyProducts.update);
  const toggleProduct = useMutation(api.agencyProducts.toggleActive);
  const removeProduct = useMutation(api.agencyProducts.remove);

  const upsertCommission = useMutation(api.carrierCommissions.upsert);
  const removeCommission = useMutation(api.carrierCommissions.remove);

  const updateAgencyType = useMutation(api.agencyTypes.update);

  // Carrier dialog
  const [carrierDialog, setCarrierDialog] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });
  const [carrierForm, setCarrierForm] = useState({ name: "", description: "" });

  // Product dialog
  const [productDialog, setProductDialog] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });
  const [productForm, setProductForm] = useState({ name: "", description: "" });

  // Commission dialog
  const [commissionDialog, setCommissionDialog] = useState<{
    open: boolean;
    carrierId: Id<"agencyCarriers"> | null;
    productId: Id<"agencyProducts"> | null;
    existing: any;
  }>({ open: false, carrierId: null, productId: null, existing: null });
  const [commissionForm, setCommissionForm] = useState({ commissionRate: "", renewalRate: "" });

  // Edit agency type dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", monthlyBasePrice: "", perUserPrice: "" });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: "carrier" | "product"; item: any } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Build commission lookup map
  const commissionMap = new Map<string, any>();
  commissions?.forEach((c) => {
    commissionMap.set(`${c.carrierId}-${c.productId}`, c);
  });

  const tenantCount = tenants?.filter((t) => t.agencyTypeId === agencyTypeId).length ?? 0;

  // --- Handlers ---
  const handleCarrierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (carrierDialog.editing) {
        await updateCarrier({
          id: carrierDialog.editing._id,
          name: carrierForm.name,
        });
      } else {
        await createCarrier({
          agencyTypeId,
          name: carrierForm.name,
        });
      }
      setCarrierDialog({ open: false, editing: null });
      setCarrierForm({ name: "", description: "" });
    } catch (error) {
      console.error("Failed to save carrier:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (productDialog.editing) {
        await updateProduct({
          id: productDialog.editing._id,
          name: productForm.name,
        });
      } else {
        // Need a carrierId — use the first carrier if available
        const firstCarrier = carriers?.[0];
        if (!firstCarrier) {
          console.error("No carriers available. Add a carrier first.");
          return;
        }
        await createProduct({
          agencyTypeId,
          carrierId: firstCarrier._id,
          name: productForm.name,
        });
      }
      setProductDialog({ open: false, editing: null });
      setProductForm({ name: "", description: "" });
    } catch (error) {
      console.error("Failed to save product:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commissionDialog.carrierId || !commissionDialog.productId) return;
    setIsSubmitting(true);
    try {
      await upsertCommission({
        agencyTypeId,
        carrierId: commissionDialog.carrierId,
        productId: commissionDialog.productId,
        commissionRate: parseFloat(commissionForm.commissionRate) || 0,
        renewalRate: parseFloat(commissionForm.renewalRate) || 0,
      });
      setCommissionDialog({ open: false, carrierId: null, productId: null, existing: null });
      setCommissionForm({ commissionRate: "", renewalRate: "" });
    } catch (error) {
      console.error("Failed to save commission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await updateAgencyType({
        id: agencyTypeId,
        name: editForm.name,
        description: editForm.description || undefined,
        monthlyBasePrice: editForm.monthlyBasePrice ? parseFloat(editForm.monthlyBasePrice) : undefined,
        perUserPrice: editForm.perUserPrice ? parseFloat(editForm.perUserPrice) : undefined,
      });
      setEditOpen(false);
    } catch (error) {
      console.error("Failed to update agency type:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      if (deleteTarget.type === "carrier") {
        await removeCarrier({ id: deleteTarget.item._id });
      } else {
        await removeProduct({ id: deleteTarget.item._id });
      }
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCommissionDialog = (carrierId: Id<"agencyCarriers">, productId: Id<"agencyProducts">) => {
    const existing = commissionMap.get(`${carrierId}-${productId}`);
    setCommissionForm({
      commissionRate: existing?.commissionRate?.toString() || "",
      renewalRate: existing?.renewalRate?.toString() || "",
    });
    setCommissionDialog({ open: true, carrierId, productId, existing });
  };

  // --- Loading / Auth states ---
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
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (agencyType === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (agencyType === null) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Agency Type Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/settings">
              <Button className="w-full"><ArrowLeft className="h-4 w-4 mr-2" />Back to Settings</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">{agencyType.name}</h1>
          <Badge variant={agencyType.isActive ? "default" : "secondary"}>
            {agencyType.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setEditForm({
              name: agencyType.name,
              description: agencyType.description || "",
              monthlyBasePrice: agencyType.monthlyBasePrice?.toString() || "",
              perUserPrice: agencyType.perUserPrice?.toString() || "",
            });
            setEditOpen(true);
          }}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="carriers">Carriers</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                <div>
                  <dt className="text-muted-foreground mb-1">Name</dt>
                  <dd className="font-medium text-sm">{agencyType.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Description</dt>
                  <dd className="font-medium">{agencyType.description || "---"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Status</dt>
                  <dd>
                    <Badge variant={agencyType.isActive ? "default" : "secondary"}>
                      {agencyType.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Default Base Price</dt>
                  <dd className="font-medium">{agencyType.monthlyBasePrice != null ? `$${agencyType.monthlyBasePrice}/mo` : "---"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Default Per-User Price</dt>
                  <dd className="font-medium">{agencyType.perUserPrice != null ? `$${agencyType.perUserPrice}/mo` : "---"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Tenants Using</dt>
                  <dd className="font-medium">{tenantCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Carriers</dt>
                  <dd className="font-medium">{carriers?.length ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Products</dt>
                  <dd className="font-medium">{products?.length ?? 0}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Carriers Tab */}
        <TabsContent value="carriers">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-sm">Carriers</CardTitle>
                    <CardDescription>Companies/carriers this agency type represents</CardDescription>
                  </div>
                </div>
                <Button onClick={() => { setCarrierForm({ name: "", description: "" }); setCarrierDialog({ open: true, editing: null }); }}>
                  <Plus className="h-4 w-4 mr-2" />Add Carrier
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {carriers && carriers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {carriers.map((carrier) => (
                      <TableRow key={carrier._id}>
                        <TableCell className="font-medium">{carrier.name}</TableCell>
                        <TableCell className="text-muted-foreground">{carrier.description || "---"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={carrier.isActive ? "default" : "secondary"}>
                            {carrier.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                              setCarrierForm({ name: carrier.name, description: carrier.description || "" });
                              setCarrierDialog({ open: true, editing: carrier });
                            }}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleCarrier({ id: carrier._id })}>
                              {carrier.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "carrier", item: carrier })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No carriers yet. Add carriers that this agency type represents.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-sm">Products</CardTitle>
                    <CardDescription>Services/products this agency type sells</CardDescription>
                  </div>
                </div>
                <Button onClick={() => { setProductForm({ name: "", description: "" }); setProductDialog({ open: true, editing: null }); }}>
                  <Plus className="h-4 w-4 mr-2" />Add Product
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {products && products.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product._id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-muted-foreground">{product.description || "---"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={product.isActive ? "default" : "secondary"}>
                            {product.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                              setProductForm({ name: product.name, description: product.description || "" });
                              setProductDialog({ open: true, editing: product });
                            }}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleProduct({ id: product._id })}>
                              {product.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "product", item: product })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No products yet. Add products/services this agency type offers.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Grid3X3 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">Commission Rates</CardTitle>
                  <CardDescription>Commission and renewal rates per carrier-product combination. Click a cell to set rates.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(!carriers || carriers.length === 0 || !products || products.length === 0) ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Grid3X3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    {!carriers || carriers.length === 0
                      ? "Add carriers first to configure commission rates."
                      : "Add products first to configure commission rates."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10 min-w-[150px]">Carrier</TableHead>
                        {products.map((product) => (
                          <TableHead key={product._id} className="text-center min-w-[120px]">
                            {product.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carriers.map((carrier) => (
                        <TableRow key={carrier._id}>
                          <TableCell className="sticky left-0 bg-background z-10 font-medium">
                            {carrier.name}
                          </TableCell>
                          {products.map((product) => {
                            const comm = commissionMap.get(`${carrier._id}-${product._id}`);
                            return (
                              <TableCell
                                key={product._id}
                                className="text-center cursor-pointer hover:bg-muted transition-colors"
                                onClick={() => openCommissionDialog(carrier._id, product._id)}
                              >
                                {comm ? (
                                  <div className="text-sm">
                                    <span className="font-medium">{comm.commissionRate}%</span>
                                    <span className="text-muted-foreground"> / </span>
                                    <span className="text-muted-foreground">{comm.renewalRate}%</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">---</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-3">Format: Commission% / Renewal%</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Carrier Dialog */}
      <Dialog
        open={carrierDialog.open}
        onOpenChange={(open) => { if (!open) { setCarrierDialog({ open: false, editing: null }); setCarrierForm({ name: "", description: "" }); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{carrierDialog.editing ? "Edit Carrier" : "Add Carrier"}</DialogTitle>
            <DialogDescription>
              {carrierDialog.editing ? "Update carrier details." : "Add a new carrier/company."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCarrierSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="carrier-name">Name *</Label>
                <Input id="carrier-name" placeholder="e.g., State Farm" value={carrierForm.name} onChange={(e) => setCarrierForm((p) => ({ ...p, name: e.target.value }))} required disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier-desc">Description</Label>
                <Input id="carrier-desc" placeholder="Optional description" value={carrierForm.description} onChange={(e) => setCarrierForm((p) => ({ ...p, description: e.target.value }))} disabled={isSubmitting} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCarrierDialog({ open: false, editing: null }); setCarrierForm({ name: "", description: "" }); }} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {carrierDialog.editing ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog
        open={productDialog.open}
        onOpenChange={(open) => { if (!open) { setProductDialog({ open: false, editing: null }); setProductForm({ name: "", description: "" }); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{productDialog.editing ? "Edit Product" : "Add Product"}</DialogTitle>
            <DialogDescription>
              {productDialog.editing ? "Update product details." : "Add a new product/service."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleProductSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="product-name">Name *</Label>
                <Input id="product-name" placeholder="e.g., Home Insurance" value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} required disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-desc">Description</Label>
                <Input id="product-desc" placeholder="Optional description" value={productForm.description} onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))} disabled={isSubmitting} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setProductDialog({ open: false, editing: null }); setProductForm({ name: "", description: "" }); }} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {productDialog.editing ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Commission Dialog */}
      <Dialog
        open={commissionDialog.open}
        onOpenChange={(open) => { if (!open) { setCommissionDialog({ open: false, carrierId: null, productId: null, existing: null }); setCommissionForm({ commissionRate: "", renewalRate: "" }); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Commission Rates</DialogTitle>
            <DialogDescription>
              {commissionDialog.carrierId && commissionDialog.productId && (
                <>
                  {carriers?.find((c) => c._id === commissionDialog.carrierId)?.name}
                  {" x "}
                  {products?.find((p) => p._id === commissionDialog.productId)?.name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCommissionSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="commission-rate">Commission Rate (%)</Label>
                <Input id="commission-rate" type="number" min="0" max="100" step="0.1" placeholder="15" value={commissionForm.commissionRate} onChange={(e) => setCommissionForm((p) => ({ ...p, commissionRate: e.target.value }))} disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal-rate">Renewal Rate (%)</Label>
                <Input id="renewal-rate" type="number" min="0" max="100" step="0.1" placeholder="10" value={commissionForm.renewalRate} onChange={(e) => setCommissionForm((p) => ({ ...p, renewalRate: e.target.value }))} disabled={isSubmitting} />
              </div>
            </div>
            <DialogFooter>
              {commissionDialog.existing && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="mr-auto"
                  onClick={async () => {
                    await removeCommission({ id: commissionDialog.existing._id });
                    setCommissionDialog({ open: false, carrierId: null, productId: null, existing: null });
                  }}
                  disabled={isSubmitting}
                >
                  Remove
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setCommissionDialog({ open: false, carrierId: null, productId: null, existing: null })} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Agency Type Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agency Type</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name *</Label>
                <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-desc">Description</Label>
                <Input id="edit-desc" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-base">Base Price ($/mo)</Label>
                  <Input id="edit-base" type="number" min="0" step="0.01" value={editForm.monthlyBasePrice} onChange={(e) => setEditForm((p) => ({ ...p, monthlyBasePrice: e.target.value }))} disabled={isSubmitting} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-per-user">Per-User ($/mo)</Label>
                  <Input id="edit-per-user" type="number" min="0" step="0.01" value={editForm.perUserPrice} onChange={(e) => setEditForm((p) => ({ ...p, perUserPrice: e.target.value }))} disabled={isSubmitting} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.type === "carrier" ? "Carrier" : "Product"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.item?.name}</strong>? This will also remove all associated commission rates.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isSubmitting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
