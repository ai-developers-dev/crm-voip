"use client";

import { useState, useEffect, useMemo } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, AlertCircle, CheckCircle, Info, Plus, Trash2, ChevronRight, ToggleLeft, ToggleRight, Download, Chrome } from "lucide-react";

export default function CarriersSettingsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

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

  // Queries
  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

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
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const existingProducts = useQuery(
    api.tenantCommissions.getSelectedProducts,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const existingCommissions = useQuery(
    api.tenantCommissions.getCommissions,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const saveBusinessSetup = useMutation(api.tenantCommissions.saveBusinessSetup);

  // Sale Types
  const saleTypes = useQuery(
    api.saleTypes.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );
  const createSaleType = useMutation(api.saleTypes.create);
  const updateSaleType = useMutation(api.saleTypes.update);
  const removeSaleType = useMutation(api.saleTypes.remove);
  const [newSaleTypeName, setNewSaleTypeName] = useState("");

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
    if (hydrated) return;
    if (!convexOrg) return;

    if (convexOrg.agencyTypeId) {
      setSelectedAgencyTypeId(convexOrg.agencyTypeId);
    }

    if (convexOrg.agencyTypeId && existingCarriers === undefined) return;
    if (convexOrg.agencyTypeId && existingProducts === undefined) return;
    if (convexOrg.agencyTypeId && existingCommissions === undefined) return;

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
  }, [hydrated, convexOrg, existingCarriers, existingProducts, existingCommissions]);

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
        // Uncheck all products for this carrier
        const carrierProducts = productsByCarrier.get(carrierId) ?? [];
        setSelectedProductIds((prevProducts) => {
          const updated = new Set(prevProducts);
          for (const p of carrierProducts) updated.delete(p._id);
          return updated;
        });
        // Collapse
        setExpandedCarrierIds((prev) => { const n = new Set(prev); n.delete(carrierId); return n; });
        // Clean commission rates
        setCommissionRates((rates) => {
          const updated = new Map(rates);
          for (const key of updated.keys()) {
            if (key.startsWith(`${carrierId}-`)) updated.delete(key);
          }
          return updated;
        });
      } else {
        next.add(carrierId);
        // Auto-expand
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

  const setCommissionRate = (
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
    if (!organization?.id || !selectedAgencyTypeId) return;

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
        clerkOrgId: organization.id,
        agencyTypeId: selectedAgencyTypeId as Id<"agencyTypes">,
        carrierIds: [...selectedCarrierIds] as Id<"agencyCarriers">[],
        productIds: [...selectedProductIds] as Id<"agencyProducts">[],
        commissions,
      });

      setSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  const activeCarriers = carriers?.filter((c) => c.isActive) || [];
  const activeProducts = products?.filter((p) => p.isActive) || [];
  const showMatrix = selectedCarrierIds.size > 0 && selectedProductIds.size > 0;
  const selectedCarriersList = activeCarriers.filter((c) => selectedCarrierIds.has(c._id));
  const selectedProductsList = activeProducts.filter((p) => selectedProductIds.has(p._id));

  return (
    <div className="p-4 md:p-6 pb-16 max-w-4xl lg:max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Carriers & Lines of Business</h1>
        <p className="text-on-surface-variant">
          Select the carriers and products your agency works with
        </p>
      </div>

      {/* Alerts */}
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

      {/* Top row: Agency Type + Carrier Tree side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Agency Type */}
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm font-semibold">Agency Type</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {agencyTypes && agencyTypes.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  No agency types configured yet.
                </AlertDescription>
              </Alert>
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
          </CardContent>
        </Card>

        {/* Carriers & Lines of Business */}
        {selectedAgencyTypeId ? (
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Carriers & Lines of Business</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {activeCarriers.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No carriers configured for this agency type.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-0.5 max-h-[400px] overflow-y-auto">
                  {activeCarriers.map((carrier) => {
                    const isChecked = selectedCarrierIds.has(carrier._id);
                    const isExpanded = expandedCarrierIds.has(carrier._id);
                    const carrierProducts = productsByCarrier.get(carrier._id) ?? [];
                    const selectedCount = carrierProducts.filter((p) => selectedProductIds.has(p._id)).length;

                    return (
                      <div key={carrier._id} className="break-inside-avoid">
                        <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-surface-container-high/50">
                          <button
                            type="button"
                            onClick={() => toggleExpandCarrier(carrier._id)}
                            className="shrink-0 p-0.5 rounded hover:bg-surface-container-high"
                          >
                            <ChevronRight className={`h-3.5 w-3.5 text-on-surface-variant transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                          </button>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleCarrier(carrier._id)}
                          />
                          <span className="text-sm font-medium">{carrier.name}</span>
                          {isChecked && carrierProducts.length > 0 && (
                            <span className="text-xs text-on-surface-variant">{selectedCount}/{carrierProducts.length}</span>
                          )}
                        </div>
                        <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
                          <div className="pl-10 space-y-0.5 pb-1">
                            {carrierProducts.length === 0 ? (
                              <p className="text-xs text-on-surface-variant py-1">No LOBs configured.</p>
                            ) : (
                              carrierProducts.map((product) => (
                                <label
                                  key={product._id}
                                  className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-surface-container-high/30 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={selectedProductIds.has(product._id)}
                                    onCheckedChange={() => toggleProduct(product._id)}
                                    disabled={!isChecked}
                                  />
                                  <span className={`text-sm ${!isChecked ? "text-on-surface-variant" : ""}`}>{product.name}</span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : <div />}
      </div>

      {/* Bottom row: Commission Rates + Sale Types side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Commission Rates */}
        {selectedCarrierIds.size > 0 ? (
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Commission Rates</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {selectedCarriersList.map((carrier) => {
                  const carrierProducts = (productsByCarrier.get(carrier._id) ?? []).filter(
                    (p) => selectedProductIds.has(p._id)
                  );
                  if (carrierProducts.length === 0) return null;
                  return (
                    <div key={carrier._id}>
                      <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">{carrier.name}</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">LOB</TableHead>
                            <TableHead className="text-xs w-[80px]">Comm %</TableHead>
                            <TableHead className="text-xs w-[80px]">Renewal %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {carrierProducts.map((product) => {
                            const rate = getCommissionRate(carrier._id, product._id);
                            return (
                              <TableRow key={product._id}>
                                <TableCell className="font-medium text-xs py-1.5">{product.name}</TableCell>
                                <TableCell className="py-1.5">
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    placeholder="0"
                                    value={rate.commission}
                                    onChange={(e) =>
                                      setCommissionRate(carrier._id, product._id, "commission", e.target.value)
                                    }
                                    className="h-7 text-xs w-16"
                                  />
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    placeholder="0"
                                    value={rate.renewal}
                                    onChange={(e) =>
                                      setCommissionRate(carrier._id, product._id, "renewal", e.target.value)
                                    }
                                    className="h-7 text-xs w-16"
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : <div />}

        {/* Sale Types */}
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm font-semibold">Sale Types</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {saleTypes && saleTypes.length > 0 && (
              <div className="space-y-0.5">
                {saleTypes.map((st) => (
                  <div key={st._id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-surface-container-high/50 group -mx-2">
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
                  if (e.key === "Enter" && newSaleTypeName.trim() && convexOrg?._id) {
                    e.preventDefault();
                    createSaleType({ organizationId: convexOrg._id, name: newSaleTypeName.trim() });
                    setNewSaleTypeName("");
                  }
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs shrink-0"
                disabled={!newSaleTypeName.trim() || !convexOrg?._id}
                onClick={() => {
                  if (convexOrg?._id && newSaleTypeName.trim()) {
                    createSaleType({ organizationId: convexOrg._id, name: newSaleTypeName.trim() });
                    setNewSaleTypeName("");
                  }
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      {selectedAgencyTypeId && (
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      )}
      {/* Chrome Extension */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Chrome className="h-5 w-5" />
            Carrier Portal Helper — Chrome Extension
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-on-surface-variant">
            This extension automatically fills in the policy number or client name when you open a carrier portal from the Policies panel. It saves time by eliminating manual copy-paste.
          </p>

          <div className="flex items-center gap-3">
            <a href="/crm-carrier-helper.zip" download>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Download Extension (.zip)
              </Button>
            </a>
          </div>

          <div className="rounded-lg border bg-surface-container/30 p-4 space-y-3">
            <h4 className="text-sm font-semibold">Installation Instructions</h4>
            <ol className="text-sm text-on-surface-variant space-y-2 list-decimal list-inside">
              <li>Download and unzip the file above</li>
              <li>
                Open Chrome and go to{" "}
                <code className="rounded bg-surface-container px-1.5 py-0.5 text-xs font-mono">
                  chrome://extensions
                </code>
              </li>
              <li>
                Enable <strong>Developer mode</strong> (toggle in the top-right corner)
              </li>
              <li>
                Click <strong>Load unpacked</strong> and select the unzipped{" "}
                <code className="rounded bg-surface-container px-1.5 py-0.5 text-xs font-mono">
                  chrome-extension
                </code>{" "}
                folder
              </li>
              <li>The extension icon will appear in your toolbar — you&apos;re all set</li>
            </ol>
          </div>

          <div className="rounded-lg border bg-surface-container/30 p-4 space-y-2">
            <h4 className="text-sm font-semibold">How It Works</h4>
            <ol className="text-sm text-on-surface-variant space-y-1.5 list-decimal list-inside">
              <li>Click a carrier name in a contact&apos;s Policies panel</li>
              <li>The policy number is copied to your clipboard and the carrier portal opens</li>
              <li>The extension detects the portal and auto-fills the search field</li>
            </ol>
            <p className="text-xs text-on-surface-variant mt-2">
              Supports Progressive, Travelers, State Farm, Nationwide, and auto-detects search fields on other portals. Make sure you&apos;re logged into the carrier portal for best results.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
