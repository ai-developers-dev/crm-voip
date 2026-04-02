"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, AlertCircle, CheckCircle, Plus, Trash2, ChevronRight, ToggleLeft, ToggleRight, Download, Chrome, KeyRound, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { NatGenLoginTest } from "@/components/settings/natgen-login-test";

interface CarriersSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  clerkOrgId: string;
  initialAgencyTypeId?: string;
}

export function CarriersSettingsDialog({
  open,
  onOpenChange,
  organizationId,
  clerkOrgId,
  initialAgencyTypeId,
}: CarriersSettingsDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [selectedAgencyTypeId, setSelectedAgencyTypeId] = useState<string>("");
  const [selectedCarrierIds, setSelectedCarrierIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [commissionRates, setCommissionRates] = useState<
    Map<string, { commission: string; renewal: string }>
  >(new Map());

  const agencyTypes = useQuery(api.agencyTypes.getActive);

  const carriers = useQuery(
    api.agencyCarriers.getByAgencyType,
    selectedAgencyTypeId
      ? { agencyTypeId: selectedAgencyTypeId as Id<"agencyTypes"> }
      : "skip"
  );

  const products = useQuery(
    api.agencyProducts.getByAgencyType,
    selectedAgencyTypeId
      ? { agencyTypeId: selectedAgencyTypeId as Id<"agencyTypes"> }
      : "skip"
  );

  const platformCommissions = useQuery(
    api.carrierCommissions.getByAgencyType,
    selectedAgencyTypeId
      ? { agencyTypeId: selectedAgencyTypeId as Id<"agencyTypes"> }
      : "skip"
  );

  const existingCarriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    { organizationId }
  );

  const existingProducts = useQuery(
    api.tenantCommissions.getSelectedProducts,
    { organizationId }
  );

  const existingCommissions = useQuery(
    api.tenantCommissions.getCommissions,
    { organizationId }
  );

  const saveBusinessSetup = useMutation(api.tenantCommissions.saveBusinessSetup);

  // Sale Types
  const saleTypes = useQuery(
    api.saleTypes.getByOrganization,
    { organizationId }
  );
  const createSaleType = useMutation(api.saleTypes.create);
  const updateSaleType = useMutation(api.saleTypes.update);
  const removeSaleType = useMutation(api.saleTypes.remove);
  const [newSaleTypeName, setNewSaleTypeName] = useState("");

  // Portal credentials per carrier: Map<carrierId, { url, username, password }>
  const [carrierCredentials, setCarrierCredentials] = useState<
    Map<string, { url: string; username: string; password: string; configured: boolean }>
  >(new Map());
  const [showPasswordFor, setShowPasswordFor] = useState<Set<string>>(new Set());
  const [expandedCredsFor, setExpandedCredsFor] = useState<Set<string>>(new Set());
  const toggleExpandCreds = (id: string) => {
    setExpandedCredsFor((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const [savingCredsFor, setSavingCredsFor] = useState<string | null>(null);

  const saveCarrierCreds = useMutation(api.tenantCommissions.updateCarrierCredentials);

  const handleSaveCredentials = async (carrierId: string) => {
    const creds = carrierCredentials.get(carrierId);
    if (!creds?.username || !creds?.password) return;
    setSavingCredsFor(carrierId);
    try {
      // Encrypt before saving
      const res = await fetch("/api/natgen-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          carrierId,
          username: creds.username,
          password: creds.password,
          portalUrl: creds.url || undefined,
        }),
      });
      if (res.ok) {
        setCarrierCredentials((prev) => {
          const next = new Map(prev);
          next.set(carrierId, { ...creds, configured: true, username: "", password: "" });
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to save credentials:", err);
    } finally {
      setSavingCredsFor(null);
    }
  };

  const updateCredField = (carrierId: string, field: string, value: string) => {
    setCarrierCredentials((prev) => {
      const next = new Map(prev);
      const current = next.get(carrierId) || { url: "", username: "", password: "", configured: false };
      next.set(carrierId, { ...current, [field]: value });
      return next;
    });
  };

  // Hydrate credential status from tenantCarriers (always sync configured status from server)
  useEffect(() => {
    if (!existingCarriers) return;
    setCarrierCredentials((prev) => {
      const next = new Map(prev);
      for (const tc of existingCarriers as any[]) {
        const existing = next.get(tc.carrierId);
        next.set(tc.carrierId, {
          url: existing?.url || tc.portalUrl || "",
          username: existing?.username || "",
          password: existing?.password || "",
          configured: !!tc.portalConfigured,
        });
      }
      return next;
    });
  }, [existingCarriers]);

  // Expand/collapse state for carrier tree
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
    const map = new Map<string, NonNullable<typeof products>>();
    if (!products) return map;
    for (const product of products) {
      if (!product.isActive) continue;
      const list = map.get(product.carrierId) ?? [];
      list.push(product);
      map.set(product.carrierId, list);
    }
    return map;
  }, [products]);

  // Hydrate from existing data
  useEffect(() => {
    if (!open || hydrated) return;

    if (initialAgencyTypeId) {
      setSelectedAgencyTypeId(initialAgencyTypeId);
    }

    if (initialAgencyTypeId && existingCarriers === undefined) return;
    if (initialAgencyTypeId && existingProducts === undefined) return;
    if (initialAgencyTypeId && existingCommissions === undefined) return;

    if (existingCarriers && existingCarriers.length > 0) {
      const carrierIdSet = new Set(existingCarriers.map((c) => c.carrierId));
      setSelectedCarrierIds(carrierIdSet);
      setExpandedCarrierIds(new Set(carrierIdSet));
    }

    if (existingProducts && existingProducts.length > 0) {
      setSelectedProductIds(new Set(existingProducts.map((p) => p.productId)));
    }

    if (existingCommissions && existingCommissions.length > 0) {
      const map = new Map<string, { commission: string; renewal: string }>();
      for (const comm of existingCommissions) {
        map.set(`${comm.carrierId}-${comm.productId}`, {
          commission: String(comm.commissionRate),
          renewal: comm.renewalRate != null ? String(comm.renewalRate) : "",
        });
      }
      setCommissionRates(map);
    }

    setHydrated(true);
  }, [open, hydrated, initialAgencyTypeId, existingCarriers, existingProducts, existingCommissions]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setHydrated(false);
      setSuccess(false);
      setError(null);
      setNewSaleTypeName("");
    }
  }, [open]);

  const getDefaultRate = (carrierId: string, productId: string) => {
    if (!platformCommissions) return { commission: "", renewal: "" };
    const match = platformCommissions.find(
      (c) => c.carrierId === carrierId && c.productId === productId
    );
    if (match) {
      return {
        commission: String(match.commissionRate),
        renewal: String(match.renewalRate),
      };
    }
    return { commission: "", renewal: "" };
  };

  const handleAgencyTypeChange = (value: string) => {
    setSelectedAgencyTypeId(value);
    setSelectedCarrierIds(new Set());
    setSelectedProductIds(new Set());
    setCommissionRates(new Map());
  };

  const toggleCarrier = (carrierId: string) => {
    setSelectedCarrierIds((prev) => {
      const next = new Set(prev);
      if (next.has(carrierId)) {
        next.delete(carrierId);
        const carrierProducts = productsByCarrier.get(carrierId) ?? [];
        setSelectedProductIds((prevProducts) => {
          const updated = new Set(prevProducts);
          for (const p of carrierProducts) updated.delete(p._id);
          return updated;
        });
        setExpandedCarrierIds((prev) => { const n = new Set(prev); n.delete(carrierId); return n; });
        setCommissionRates((rates) => {
          const updated = new Map(rates);
          for (const key of updated.keys()) {
            if (key.startsWith(`${carrierId}-`)) updated.delete(key);
          }
          return updated;
        });
      } else {
        next.add(carrierId);
        setExpandedCarrierIds((prev) => new Set(prev).add(carrierId));
      }
      return next;
    });
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        setCommissionRates((rates) => {
          const updated = new Map(rates);
          for (const key of updated.keys()) {
            if (key.endsWith(`-${productId}`)) updated.delete(key);
          }
          return updated;
        });
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const getCommissionRate = (carrierId: string, productId: string) => {
    const key = `${carrierId}-${productId}`;
    return commissionRates.get(key) || getDefaultRate(carrierId, productId);
  };

  const setCommissionRateValue = (
    carrierId: string,
    productId: string,
    field: "commission" | "renewal",
    value: string
  ) => {
    const key = `${carrierId}-${productId}`;
    setCommissionRates((prev) => {
      const updated = new Map(prev);
      const current = updated.get(key) || getDefaultRate(carrierId, productId);
      updated.set(key, { ...current, [field]: value });
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!selectedAgencyTypeId) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const commissions: Array<{
        carrierId: Id<"agencyCarriers">;
        productId: Id<"agencyProducts">;
        commissionRate: number;
        renewalRate?: number;
      }> = [];

      for (const carrierId of selectedCarrierIds) {
        for (const productId of selectedProductIds) {
          const rate = getCommissionRate(carrierId, productId);
          const commissionVal = parseFloat(rate.commission);
          if (!isNaN(commissionVal) && commissionVal > 0) {
            const renewalVal = parseFloat(rate.renewal);
            commissions.push({
              carrierId: carrierId as Id<"agencyCarriers">,
              productId: productId as Id<"agencyProducts">,
              commissionRate: commissionVal,
              ...(!isNaN(renewalVal) && renewalVal > 0 && { renewalRate: renewalVal }),
            });
          }
        }
      }

      await saveBusinessSetup({
        clerkOrgId,
        agencyTypeId: selectedAgencyTypeId as Id<"agencyTypes">,
        carrierIds: [...selectedCarrierIds] as Id<"agencyCarriers">[],
        productIds: [...selectedProductIds] as Id<"agencyProducts">[],
        commissions,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeCarriers = carriers?.filter((c) => c.isActive) || [];
  const selectedCarriersList = activeCarriers.filter((c) => selectedCarrierIds.has(c._id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carriers & Lines of Business</DialogTitle>
          <DialogDescription>
            Select the carriers and products your agency works with
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Carriers and products saved successfully!
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {/* Agency Type */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Agency Type</Label>
            {agencyTypes && agencyTypes.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No agency types configured yet.</p>
            ) : (
              <Select value={selectedAgencyTypeId} onValueChange={handleAgencyTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agency type" />
                </SelectTrigger>
                <SelectContent>
                  {agencyTypes?.map((type) => (
                    <SelectItem key={type._id} value={type._id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Carriers & Lines of Business */}
          {selectedAgencyTypeId && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Carriers & Lines of Business</Label>
              {activeCarriers.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No carriers configured for this agency type.
                </p>
              ) : (
                <div className="max-h-[450px] overflow-y-auto space-y-2">
                  {activeCarriers.map((carrier) => {
                    const isChecked = selectedCarrierIds.has(carrier._id);
                    const isExpanded = expandedCarrierIds.has(carrier._id);
                    const carrierProducts = productsByCarrier.get(carrier._id) ?? [];
                    const selectedCount = carrierProducts.filter((p) => selectedProductIds.has(p._id)).length;
                    const hasCredentials = carrierCredentials.get(carrier._id)?.configured;

                    return (
                      <div key={carrier._id} className={`rounded-lg border transition-colors ${isChecked ? "border-primary/30 bg-primary/[0.02]" : "bg-muted/30"}`}>
                        {/* Carrier header */}
                        <div
                          className="flex items-center w-full gap-3 p-3 cursor-pointer"
                          onClick={() => toggleExpandCarrier(carrier._id)}
                        >
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleCarrier(carrier._id)}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{carrier.name}</span>
                              {isChecked && carrierProducts.length > 0 && (
                                <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                                  {selectedCount}/{carrierProducts.length} LOBs
                                </span>
                              )}
                              {hasCredentials && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] h-5 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">
                                  Portal Connected
                                </Badge>
                              )}
                            </div>
                          </div>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                        </div>

                        {/* Expanded content */}
                        <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}>
                          <div className="px-3 pb-3 space-y-3">
                            {/* Products / Lines of Business */}
                            <div className="rounded-md border bg-background">
                              <div className="px-3 py-2 border-b bg-muted/40">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lines of Business</span>
                              </div>
                              {carrierProducts.length === 0 ? (
                                <p className="text-xs text-muted-foreground p-3">No LOBs configured for this carrier.</p>
                              ) : (
                                <div className="divide-y">
                                  {carrierProducts.map((product) => {
                                    const isProductChecked = selectedProductIds.has(product._id);
                                    const rate = isChecked && isProductChecked
                                      ? getCommissionRate(carrier._id, product._id)
                                      : null;
                                    return (
                                      <div key={product._id} className="flex items-center gap-3 px-3 py-2.5">
                                        <Checkbox
                                          checked={isProductChecked}
                                          onCheckedChange={() => toggleProduct(product._id)}
                                          disabled={!isChecked}
                                        />
                                        <span className={`text-sm flex-1 ${!isChecked ? "text-muted-foreground" : ""}`}>{product.name}</span>
                                        {rate && (
                                          <div className="flex items-center gap-3 shrink-0">
                                            <div className="flex items-center gap-1.5">
                                              <Label className="text-xs text-muted-foreground w-8">New %</Label>
                                              <Input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.1"
                                                placeholder="0"
                                                value={rate.commission}
                                                onChange={(e) =>
                                                  setCommissionRateValue(carrier._id, product._id, "commission", e.target.value)
                                                }
                                                className="h-7 text-xs w-16 px-2 text-center"
                                              />
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <Label className="text-xs text-muted-foreground w-8">Rnw %</Label>
                                              <Input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.1"
                                                placeholder="0"
                                                value={rate.renewal}
                                                onChange={(e) =>
                                                  setCommissionRateValue(carrier._id, product._id, "renewal", e.target.value)
                                                }
                                                className="h-7 text-xs w-16 px-2 text-center"
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Portal Credentials */}
                            {isChecked && (
                              <div className="rounded-md border bg-background">
                                <button
                                  type="button"
                                  onClick={() => toggleExpandCreds(carrier._id)}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-left"
                                >
                                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex-1">Portal Credentials</span>
                                  {hasCredentials && (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Connected</span>
                                  )}
                                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expandedCredsFor.has(carrier._id) ? "rotate-90" : ""}`} />
                                </button>
                                <div className={`overflow-hidden transition-all duration-200 ${expandedCredsFor.has(carrier._id) ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"}`}>
                                  <div className="px-3 pb-3 pt-1 space-y-2 border-t">
                                    <Input
                                      value={carrierCredentials.get(carrier._id)?.url ?? carrier.portalUrl ?? ""}
                                      onChange={(e) => updateCredField(carrier._id, "url", e.target.value)}
                                      placeholder="Portal URL (e.g. https://natgenagency.com/Account/Login.aspx)"
                                      className="h-8 text-xs"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                      <Input
                                        value={carrierCredentials.get(carrier._id)?.username ?? ""}
                                        onChange={(e) => updateCredField(carrier._id, "username", e.target.value)}
                                        placeholder={hasCredentials ? "••••••••" : "Agent username"}
                                        className="h-8 text-xs"
                                      />
                                      <div className="relative">
                                        <Input
                                          type={showPasswordFor.has(carrier._id) ? "text" : "password"}
                                          value={carrierCredentials.get(carrier._id)?.password ?? ""}
                                          onChange={(e) => updateCredField(carrier._id, "password", e.target.value)}
                                          placeholder={hasCredentials ? "••••••••" : "Password"}
                                          className="h-8 text-xs pr-8"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setShowPasswordFor((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(carrier._id)) next.delete(carrier._id); else next.add(carrier._id);
                                            return next;
                                          })}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                          {showPasswordFor.has(carrier._id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs px-3"
                                        disabled={!carrierCredentials.get(carrier._id)?.username || !carrierCredentials.get(carrier._id)?.password || savingCredsFor === carrier._id}
                                        onClick={() => handleSaveCredentials(carrier._id)}
                                      >
                                        {savingCredsFor === carrier._id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <KeyRound className="h-3.5 w-3.5 mr-1.5" />}
                                        {hasCredentials ? "Update Credentials" : "Save Credentials"}
                                      </Button>
                                      {carrier.name.toLowerCase().includes("national general") && (
                                        <NatGenLoginTest
                                          organizationId={organizationId as string}
                                          carrierId={carrier._id}
                                          username={carrierCredentials.get(carrier._id)?.username || undefined}
                                          password={carrierCredentials.get(carrier._id)?.password || undefined}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sale Types */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Sale Types</Label>
            <div className="rounded-md border p-3 space-y-2">
              {saleTypes && saleTypes.length > 0 && (
                <div className="space-y-0.5">
                  {saleTypes.map((st) => (
                    <div key={st._id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-surface-container-high/50 group">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{st.name}</span>
                        <Badge variant={st.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 shrink-0">
                          {st.isActive ? "Active" : "Off"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateSaleType({ id: st._id, isActive: !st.isActive })}>
                          {st.isActive ? <ToggleRight className="h-2.5 w-2.5" /> : <ToggleLeft className="h-2.5 w-2.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeSaleType({ id: st._id })}>
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newSaleTypeName}
                  onChange={(e) => setNewSaleTypeName(e.target.value)}
                  placeholder="Sale type name..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSaleTypeName.trim()) {
                      e.preventDefault();
                      createSaleType({ organizationId, name: newSaleTypeName.trim() });
                      setNewSaleTypeName("");
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs shrink-0"
                  disabled={!newSaleTypeName.trim()}
                  onClick={() => {
                    if (newSaleTypeName.trim()) {
                      createSaleType({ organizationId, name: newSaleTypeName.trim() });
                      setNewSaleTypeName("");
                    }
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Chrome Extension */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Chrome className="h-4 w-4" />
              Carrier Portal Helper — Chrome Extension
            </Label>
            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm text-on-surface-variant">
                Auto-fills policy number when you open a carrier portal from the Policies panel.
              </p>
              <a href="/crm-carrier-helper.zip" download>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Download Extension (.zip)
                </Button>
              </a>
              <ol className="text-xs text-on-surface-variant space-y-1 list-decimal list-inside">
                <li>Download and unzip the file above</li>
                <li>Open Chrome &rarr; <code className="rounded bg-surface-container px-1 py-0.5 text-[10px] font-mono">chrome://extensions</code></li>
                <li>Enable <strong>Developer mode</strong> (top-right toggle)</li>
                <li>Click <strong>Load unpacked</strong> &rarr; select the unzipped folder</li>
              </ol>
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {selectedAgencyTypeId && (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
