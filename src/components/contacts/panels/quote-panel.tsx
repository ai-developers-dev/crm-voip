"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { X, CheckCircle, Loader2, Calculator, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface QuotePanelProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  onClose: () => void;
}

export function QuotePanel({ contact, organizationId, userId, onClose }: QuotePanelProps) {
  const org = useQuery(api.organizations.getById, { organizationId });
  const agencyTypeId = org?.agencyTypeId;

  const carriers = useQuery(
    api.agencyCarriers.getByAgencyType,
    agencyTypeId ? { agencyTypeId } : "skip"
  );

  const products = useQuery(
    api.agencyProducts.getByAgencyType,
    agencyTypeId ? { agencyTypeId } : "skip"
  );

  // Get this tenant's selected carriers
  const selectedCarriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    { organizationId }
  );

  const createLead = useMutation(api.insuranceLeads.create);

  const [selectedCarrierIds, setSelectedCarrierIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Filter carriers to only those the tenant has selected
  const tenantCarrierIds = new Set(selectedCarriers?.map((tc: any) => tc.carrierId) ?? []);
  const availableCarriers = (carriers ?? []).filter(
    (c: any) => c.isActive && (tenantCarrierIds.size === 0 || tenantCarrierIds.has(c._id))
  );

  // Get products for selected carriers
  const availableProducts = (products ?? []).filter(
    (p: any) => p.isActive && (selectedCarrierIds.size === 0 || selectedCarrierIds.has(p.carrierId))
  );

  const toggleCarrier = (id: string) => {
    setSelectedCarrierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmitQuote = async () => {
    if (selectedCarrierIds.size === 0) return;
    setSubmitting(true);
    try {
      // Build quote types from selected products
      const quoteTypes: string[] = [];
      for (const pid of selectedProductIds) {
        const product = (products ?? []).find((p: any) => p._id === pid);
        if (product) {
          const typeName = product.name.toLowerCase();
          if (typeName.includes("auto")) quoteTypes.push("auto");
          else if (typeName.includes("home") || typeName.includes("renters")) quoteTypes.push("home");
          else quoteTypes.push(typeName);
        }
      }
      // Default to auto if no specific products selected
      if (quoteTypes.length === 0) quoteTypes.push("auto");

      await createLead({
        organizationId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email || undefined,
        phone: contact.phoneNumbers?.find((p) => p.isPrimary)?.number || contact.phoneNumbers?.[0]?.number || undefined,
        dob: contact.dateOfBirth || "1990-01-01",
        gender: contact.gender || undefined,
        maritalStatus: contact.maritalStatus || undefined,
        street: contact.streetAddress || "",
        city: contact.city || "",
        state: contact.state || "",
        zip: contact.zipCode || "",
        quoteTypes: [...new Set(quoteTypes)],
        notes: `Carriers: ${[...selectedCarrierIds].map((id) => availableCarriers.find((c: any) => c._id === id)?.name).filter(Boolean).join(", ")}`,
      });

      setSubmitted(true);
    } catch (err) {
      console.error("Failed to submit quote:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Quote
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500 mb-3" />
          <p className="text-sm font-semibold mb-1">Quote Submitted</p>
          <p className="text-xs text-muted-foreground mb-4">
            Lead created for {contact.firstName} {contact.lastName}. Go to AI Agents to run the quoting agent.
          </p>
          <Button variant="outline" size="sm" onClick={() => { setSubmitted(false); setSelectedCarrierIds(new Set()); setSelectedProductIds(new Set()); }}>
            Submit Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calculator className="h-4 w-4" /> Quote for {contact.firstName}
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Carriers */}
          <section>
            <h4 className="section-heading mb-2">Select Carriers</h4>
            {availableCarriers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No carriers configured. Add carriers in Settings.</p>
            ) : (
              <div className="space-y-1.5">
                {availableCarriers.map((carrier: any) => (
                  <button
                    key={carrier._id}
                    type="button"
                    onClick={() => toggleCarrier(carrier._id)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                      selectedCarrierIds.has(carrier._id)
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md border text-xs",
                      selectedCarrierIds.has(carrier._id) ? "bg-primary border-primary text-primary-foreground" : "border-border"
                    )}>
                      {selectedCarrierIds.has(carrier._id) && <CheckCircle className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{carrier.name}</p>
                      {carrier.description && <p className="text-xs text-muted-foreground truncate">{carrier.description}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Lines of Business / Products */}
          {selectedCarrierIds.size > 0 && availableProducts.length > 0 && (
            <section>
              <h4 className="section-heading mb-2">Lines of Business</h4>
              <div className="space-y-1.5">
                {availableProducts.map((product: any) => {
                  const carrier = availableCarriers.find((c: any) => c._id === product.carrierId);
                  return (
                    <button
                      key={product._id}
                      type="button"
                      onClick={() => toggleProduct(product._id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all",
                        selectedProductIds.has(product._id)
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border text-xs",
                        selectedProductIds.has(product._id) ? "bg-primary border-primary text-primary-foreground" : "border-border"
                      )}>
                        {selectedProductIds.has(product._id) && <CheckCircle className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{product.name}</p>
                        {carrier && <p className="text-[10px] text-muted-foreground">{carrier.name}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      {/* Submit button */}
      <div className="shrink-0 border-t p-4">
        <Button
          className="w-full"
          onClick={handleSubmitQuote}
          disabled={selectedCarrierIds.size === 0 || submitting}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting...</>
          ) : (
            <><Calculator className="h-4 w-4 mr-1.5" /> Submit for Quote</>
          )}
        </Button>
      </div>
    </div>
  );
}
