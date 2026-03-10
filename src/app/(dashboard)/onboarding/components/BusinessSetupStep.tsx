"use client";

import { useState, useEffect } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle, Building2, Info } from "lucide-react";

interface BusinessSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function BusinessSetupStep({ onNext, onBack, onSkip }: BusinessSetupStepProps) {
  const { organization } = useOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [selectedAgencyTypeId, setSelectedAgencyTypeId] = useState<string>("");
  const [selectedCarrierIds, setSelectedCarrierIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  // Map of "carrierId-productId" -> { commission: string, renewal: string }
  const [commissionRates, setCommissionRates] = useState<
    Map<string, { commission: string; renewal: string }>
  >(new Map());

  // Queries
  const agencyTypes = useQuery(api.agencyTypes.getActive);

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

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

  // Platform defaults for pre-filling
  const platformCommissions = useQuery(
    api.carrierCommissions.getByAgencyType,
    selectedAgencyTypeId
      ? { agencyTypeId: selectedAgencyTypeId as Id<"agencyTypes"> }
      : "skip"
  );

  // Existing tenant data for resume
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

  // Hydrate from existing data on mount (resume support)
  useEffect(() => {
    if (hydrated) return;
    if (!convexOrg) return;

    // Set agency type from org
    if (convexOrg.agencyTypeId) {
      setSelectedAgencyTypeId(convexOrg.agencyTypeId);
    }

    // Wait for dependent queries to load
    if (convexOrg.agencyTypeId && existingCarriers === undefined) return;
    if (convexOrg.agencyTypeId && existingProducts === undefined) return;
    if (convexOrg.agencyTypeId && existingCommissions === undefined) return;

    if (existingCarriers && existingCarriers.length > 0) {
      setSelectedCarrierIds(new Set(existingCarriers.map((c) => c.carrierId)));
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

  // Pre-fill commission defaults from platform when carriers/products are first selected
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
    // Clear selections when agency type changes
    setSelectedCarrierIds(new Set());
    setSelectedProductIds(new Set());
    setCommissionRates(new Map());
  };

  const toggleCarrier = (carrierId: string) => {
    setSelectedCarrierIds((prev) => {
      const next = new Set(prev);
      if (next.has(carrierId)) {
        next.delete(carrierId);
        // Remove commission entries for this carrier
        setCommissionRates((rates) => {
          const updated = new Map(rates);
          for (const key of updated.keys()) {
            if (key.startsWith(`${carrierId}-`)) {
              updated.delete(key);
            }
          }
          return updated;
        });
      } else {
        next.add(carrierId);
      }
      return next;
    });
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        // Remove commission entries for this product
        setCommissionRates((rates) => {
          const updated = new Map(rates);
          for (const key of updated.keys()) {
            if (key.endsWith(`-${productId}`)) {
              updated.delete(key);
            }
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

    try {
      // Build commissions array from the map
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
              ...((!isNaN(renewalVal) && renewalVal > 0) && { renewalRate: renewalVal }),
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

      onNext();
    } catch (err: any) {
      setError(err.message || "Failed to save business setup. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeCarriers = carriers?.filter((c) => c.isActive) || [];
  const activeProducts = products?.filter((p) => p.isActive) || [];
  const showMatrix = selectedCarrierIds.size > 0 && selectedProductIds.size > 0;

  // Get carrier/product names for the matrix
  const selectedCarriersList = activeCarriers.filter((c) => selectedCarrierIds.has(c._id));
  const selectedProductsList = activeProducts.filter((p) => selectedProductIds.has(p._id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Business Setup</h2>
        <p className="text-muted-foreground">
          Select your agency type, carriers, and products to configure your commission structure.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Agency Type Selection */}
      <div className="space-y-2">
        <Label>Agency Type</Label>
        {agencyTypes && agencyTypes.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No agency types have been configured yet. You can skip this step and configure it later.
            </AlertDescription>
          </Alert>
        ) : (
          <Select value={selectedAgencyTypeId} onValueChange={handleAgencyTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select your agency type" />
            </SelectTrigger>
            <SelectContent>
              {agencyTypes?.map((type) => (
                <SelectItem key={type._id} value={type._id}>
                  {type.name}
                  {type.description && (
                    <span className="text-muted-foreground ml-2">- {type.description}</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Carrier & Product Selection */}
      {selectedAgencyTypeId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Carriers */}
          <div className="space-y-3">
            <Label className="text-base">Carriers You Work With</Label>
            {activeCarriers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No carriers configured for this agency type.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto rounded-lg border border-border/60 p-3">
                {activeCarriers.map((carrier) => (
                  <label
                    key={carrier._id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedCarrierIds.has(carrier._id)}
                      onCheckedChange={() => toggleCarrier(carrier._id)}
                    />
                    <div>
                      <div className="text-sm font-medium">{carrier.name}</div>
                      {carrier.description && (
                        <div className="text-xs text-muted-foreground">{carrier.description}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Products / Lines of Business */}
          <div className="space-y-3">
            <Label className="text-base">Lines of Business</Label>
            {activeProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No products configured for this agency type.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto rounded-lg border border-border/60 p-3">
                {activeProducts.map((product) => (
                  <label
                    key={product._id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedProductIds.has(product._id)}
                      onCheckedChange={() => toggleProduct(product._id)}
                    />
                    <div>
                      <div className="text-sm font-medium">{product.name}</div>
                      {product.description && (
                        <div className="text-xs text-muted-foreground">{product.description}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Commission Matrix */}
      {showMatrix && (
        <div className="space-y-3">
          <div>
            <Label className="text-base">Commission Rates</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your commission and renewal rates (%) for each carrier and product combination.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">
                    Carrier
                  </th>
                  {selectedProductsList.map((product) => (
                    <th
                      key={product._id}
                      className="text-center p-3 font-medium text-muted-foreground min-w-[140px]"
                    >
                      {product.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedCarriersList.map((carrier) => (
                  <tr key={carrier._id} className="border-b last:border-b-0">
                    <td className="p-3 font-medium">{carrier.name}</td>
                    {selectedProductsList.map((product) => {
                      const rate = getCommissionRate(carrier._id, product._id);
                      return (
                        <td key={product._id} className="p-2">
                          <div className="flex flex-col gap-1">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              placeholder="Comm %"
                              value={rate.commission}
                              onChange={(e) =>
                                setCommissionRate(
                                  carrier._id,
                                  product._id,
                                  "commission",
                                  e.target.value
                                )
                              }
                              className="h-8 text-xs"
                            />
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              placeholder="Renewal %"
                              value={rate.renewal}
                              onChange={(e) =>
                                setCommissionRate(
                                  carrier._id,
                                  product._id,
                                  "renewal",
                                  e.target.value
                                )
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (!selectedAgencyTypeId && agencyTypes && agencyTypes.length > 0)}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save & Continue"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
