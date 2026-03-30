"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

interface SaleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  /** If provided, the dialog opens in edit mode with these values pre-filled */
  editSale?: {
    _id: Id<"sales">;
    carrierId: Id<"agencyCarriers">;
    saleTypeId?: Id<"saleTypes">;
    policyNumber?: string;
    effectiveDate: number;
    term: number;
    status: "active" | "cancelled" | "pending";
    notes?: string;
    lineItems: { productId: Id<"agencyProducts">; premium: number }[];
    coverages?: Record<string, string>;
  };
}

interface LineItem {
  productId: string;
  premium: string;
}

const TERM_OPTIONS = [
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
  { value: 24, label: "24 months" },
  { value: 36, label: "36 months" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "cancelled", label: "Cancelled" },
];

export function SaleFormDialog({ open, onOpenChange, contact, organizationId, editSale }: SaleFormDialogProps) {
  const { user: clerkUser } = useUser();
  const currentUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id ? { clerkUserId: clerkUser.id, organizationId } : "skip"
  );

  const carriers = useQuery(api.sales.getCarriersWithNames, { organizationId });
  const saleTypes = useQuery(api.saleTypes.getActive, { organizationId });
  const createSale = useMutation(api.sales.create);
  const updateSale = useMutation(api.sales.update);

  const isEditing = !!editSale;

  const [carrierId, setCarrierId] = useState<string>("");
  const [saleTypeId, setSaleTypeId] = useState<string>("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ productId: "", premium: "" }]);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [term, setTerm] = useState(12);
  const [status, setStatus] = useState<"active" | "cancelled" | "pending">("active");
  const [notes, setNotes] = useState("");
  const [coverages, setCoverages] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Fetch products when carrier is selected
  const products = useQuery(
    api.sales.getProductsByCarrier,
    carrierId ? { organizationId, carrierId: carrierId as Id<"agencyCarriers"> } : "skip"
  );

  // Reset/populate form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (editSale) {
      setCarrierId(editSale.carrierId);
      setSaleTypeId(editSale.saleTypeId || "");
      setPolicyNumber(editSale.policyNumber || "");
      setLineItems(
        editSale.lineItems.map((li) => ({
          productId: li.productId,
          premium: li.premium.toString(),
        }))
      );
      const d = new Date(editSale.effectiveDate);
      setEffectiveDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
      setTerm(editSale.term);
      setStatus(editSale.status);
      setNotes(editSale.notes || "");
      setCoverages(editSale.coverages ?? {});
    } else {
      setCarrierId("");
      setSaleTypeId("");
      setPolicyNumber("");
      setLineItems([{ productId: "", premium: "" }]);
      setEffectiveDate(new Date().toISOString().slice(0, 10));
      setTerm(12);
      setStatus("active");
      setNotes("");
      setCoverages({});
    }
  }, [open, editSale]);

  // Reset line item products when carrier changes (only in create mode)
  const handleCarrierChange = (newCarrierId: string) => {
    const wasEmpty = !carrierId;
    setCarrierId(newCarrierId);
    if (!wasEmpty) {
      setLineItems((items) => items.map((item) => ({ ...item, productId: "" })));
    }
  };

  // Line item management
  const addLineItem = () => {
    setLineItems((items) => [...items, { productId: "", premium: "" }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((items) => items.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
    setLineItems((items) =>
      items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Auto-calculated fields
  const endDate = useMemo(() => {
    if (!effectiveDate) return "";
    const [y, m, d] = effectiveDate.split("-").map(Number);
    const end = new Date(y, m - 1 + term, d);
    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  }, [effectiveDate, term]);

  const totalPremium = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      const val = parseFloat(item.premium);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [lineItems]);

  // Merge coverage field definitions from selected products
  const mergedCoverageFields = useMemo(() => {
    if (!products) return [];
    const selectedProductIds = new Set(lineItems.map((li) => li.productId).filter(Boolean));
    const seen = new Set<string>();
    const fields: { key: string; label: string; placeholder?: string; type?: string; options?: string[] }[] = [];
    for (const product of products) {
      if (!selectedProductIds.has(product.productId)) continue;
      for (const field of product.coverageFields ?? []) {
        if (!seen.has(field.key)) {
          seen.add(field.key);
          fields.push(field);
        }
      }
    }
    return fields;
  }, [products, lineItems]);

  // Validation
  const isValid =
    carrierId &&
    effectiveDate &&
    (isEditing || currentUser) &&
    lineItems.every((item) => item.productId && parseFloat(item.premium) > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    try {
      const parsedEffective = (() => {
        const [y, m, d] = effectiveDate.split("-").map(Number);
        return Date.UTC(y, m - 1, d, 12, 0, 0); // UTC noon to avoid timezone boundary issues
      })();
      const parsedLineItems = lineItems.map((item) => ({
        productId: item.productId as Id<"agencyProducts">,
        premium: parseFloat(item.premium),
      }));

      // Build coverages object, only include if any field has a value
      const hasCoverages = Object.values(coverages).some((v) => v.trim());
      const parsedCoverages = hasCoverages
        ? Object.fromEntries(
            Object.entries(coverages)
              .filter(([, v]) => v.trim())
              .map(([k, v]) => [k, v.trim()])
          )
        : undefined;

      if (isEditing && editSale) {
        await updateSale({
          id: editSale._id,
          carrierId: carrierId as Id<"agencyCarriers">,
          saleTypeId: saleTypeId ? (saleTypeId as Id<"saleTypes">) : undefined,
          policyNumber: policyNumber.trim() || undefined,
          effectiveDate: parsedEffective,
          term,
          status,
          notes: notes.trim() || undefined,
          coverages: parsedCoverages,
          lineItems: parsedLineItems,
        });
      } else if (currentUser) {
        await createSale({
          organizationId,
          contactId: contact._id,
          userId: currentUser._id,
          carrierId: carrierId as Id<"agencyCarriers">,
          saleTypeId: saleTypeId ? (saleTypeId as Id<"saleTypes">) : undefined,
          policyNumber: policyNumber.trim() || undefined,
          effectiveDate: parsedEffective,
          term,
          notes: notes.trim() || undefined,
          coverages: parsedCoverages,
          lineItems: parsedLineItems,
        });
      }
      onOpenChange(false);
    } catch (err) {
      console.error(`Failed to ${isEditing ? "update" : "create"} sale:`, err);
    } finally {
      setSubmitting(false);
    }
  };

  // Format a numeric string with commas (e.g., "100000" → "100,000")
  const formatWithCommas = (val: string) => {
    const stripped = val.replace(/[^0-9.]/g, "");
    if (!stripped) return "";
    const [whole, decimal] = stripped.split(".");
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decimal !== undefined ? `${formatted}.${decimal}` : formatted;
  };

  // Strip commas for storage
  const stripCommas = (val: string) => val.replace(/,/g, "");

  const selectClasses =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Sale" : "Enter Sale"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto pr-4">
          {/* Agent & Contact info */}
          <div className="rounded-md border p-3 space-y-1 bg-surface-container/30">
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">Agent</span>
              <span className="font-medium">{currentUser?.name ?? "Loading..."}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">Insured</span>
              <span className="font-medium">
                {contact.firstName} {contact.lastName}
              </span>
            </div>
          </div>

          {/* Sale Type & Policy Number */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="saleType">Sale Type</Label>
              {saleTypes && saleTypes.length === 0 ? (
                <p className="text-xs text-on-surface-variant">
                  No sale types configured.
                </p>
              ) : (
                <select
                  id="saleType"
                  value={saleTypeId}
                  onChange={(e) => setSaleTypeId(e.target.value)}
                  className={selectClasses}
                >
                  <option value="">Select type...</option>
                  {saleTypes?.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="policyNumber">Policy Number</Label>
              <Input
                id="policyNumber"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                placeholder="Policy #"
              />
            </div>
          </div>

          {/* Status (only in edit mode) */}
          {isEditing && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "cancelled" | "pending")}
                className={selectClasses}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Carrier */}
          <div className="space-y-2">
            <Label htmlFor="carrier">Carrier</Label>
            {carriers && carriers.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No carriers configured. Contact your admin to set up carriers.
              </p>
            ) : (
              <select
                id="carrier"
                value={carrierId}
                onChange={(e) => handleCarrierChange(e.target.value)}
                className={selectClasses}
                required
              >
                <option value="">Select carrier...</option>
                {carriers?.map((c) => (
                  <option key={c.carrierId} value={c.carrierId}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <Label>Lines of Business</Label>
            {lineItems.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {index === 0 && (
                    <span className="text-xs text-on-surface-variant">Line of Business</span>
                  )}
                  <select
                    value={item.productId}
                    onChange={(e) => updateLineItem(index, "productId", e.target.value)}
                    className={selectClasses}
                    disabled={!carrierId}
                    required
                  >
                    <option value="">
                      {!carrierId
                        ? "Select carrier first"
                        : products && products.length === 0
                          ? "No lines available"
                          : "Select LOB..."}
                    </option>
                    {products?.map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32 space-y-1">
                  {index === 0 && (
                    <span className="text-xs text-on-surface-variant">Premium</span>
                  )}
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={item.premium}
                    onChange={(e) => updateLineItem(index, "premium", e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 shrink-0"
                  onClick={() => removeLineItem(index)}
                  disabled={lineItems.length === 1}
                >
                  <Trash2 className="h-4 w-4 text-on-surface-variant" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLineItem}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              Add Line Item
            </Button>
          </div>

          {/* Date & Term */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="effectiveDate">Effective Date</Label>
              <Input
                id="effectiveDate"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term">Term</Label>
              <select
                id="term"
                value={term}
                onChange={(e) => setTerm(parseInt(e.target.value))}
                className={selectClasses}
              >
                {TERM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* End Date (read-only) */}
          {endDate && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">End Date</span>
              <span className="font-medium">
                {(() => {
                  const [y, m, d] = endDate.split("-").map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  });
                })()}
              </span>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>

          {/* Coverages (dynamic from product definitions) */}
          {mergedCoverageFields.length > 0 && (
            <div className="space-y-3">
              <Label>Coverages</Label>
              <div className="grid grid-cols-2 gap-3">
                {mergedCoverageFields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <span className="text-xs text-on-surface-variant">{field.label}</span>
                    {field.type === "select" && field.options?.length ? (
                      <select
                        value={coverages[field.key] ?? ""}
                        onChange={(e) => setCoverages((c) => ({ ...c, [field.key]: e.target.value }))}
                        className={selectClasses}
                      >
                        <option value="">Select...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === "currency" || field.type === "number" ? (
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={formatWithCommas(coverages[field.key] ?? "")}
                        onChange={(e) => setCoverages((c) => ({ ...c, [field.key]: stripCommas(e.target.value) }))}
                        placeholder={field.placeholder ?? (field.type === "currency" ? "$0.00" : undefined)}
                      />
                    ) : (
                      <Input
                        type="text"
                        value={coverages[field.key] ?? ""}
                        onChange={(e) => setCoverages((c) => ({ ...c, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total Premium */}
          {totalPremium > 0 && (
            <div className="flex items-center justify-between text-sm border-t pt-3">
              <span className="font-medium">Total Premium</span>
              <span className="text-lg font-bold">
                ${totalPremium.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || submitting}>
              {submitting ? "Saving..." : isEditing ? "Update Sale" : "Submit Sale"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
