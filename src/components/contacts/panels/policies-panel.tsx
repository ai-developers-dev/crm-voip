"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { X, Plus, Search, MoreHorizontal, Trash2, Pencil, ChevronDown, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PolicyFormDialog } from "./policy-form-dialog";
import { SaleFormDialog } from "../sale-form-dialog";
import { cn } from "@/lib/utils";

interface PolicysPanelProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  isAdmin?: boolean;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  expired: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

const typeLabels: Record<string, string> = {
  home: "Home",
  auto: "Auto",
  life: "Life",
  health: "Health",
  umbrella: "Umbrella",
  commercial: "Commercial",
  other: "Other",
};

// Convert camelCase key to human-readable label (fallback for legacy data)
const formatKey = (key: string) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

type SaleForEdit = {
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

export function PoliciesPanel({ contact, organizationId, userId, isAdmin, onClose }: PolicysPanelProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Doc<"policies"> | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [hoveredSaleId, setHoveredSaleId] = useState<string | null>(null);

  // Sale edit/delete state
  const [saleEditOpen, setSaleEditOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleForEdit | undefined>(undefined);
  const [saleDeleteOpen, setSaleDeleteOpen] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<Id<"sales"> | null>(null);
  const [copiedPolicyId, setCopiedPolicyId] = useState<string | null>(null);

  const policies = useQuery(api.policies.getByContact, { contactId: contact._id });
  const sales = useQuery(api.sales.getByContact, { contactId: contact._id });
  const removePolicy = useMutation(api.policies.remove);
  const removeSale = useMutation(api.sales.remove);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const filteredPolicies = policies?.filter((p) =>
    `${p.policyNumber} ${p.carrier}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSales = sales?.filter((s) =>
    `${s.policyNumber || ""} ${s.carrierName} ${s.lineItems.map((li) => li.productName).join(" ")}`.toLowerCase().includes(search.toLowerCase())
  );

  const hasResults = (filteredPolicies?.length ?? 0) + (filteredSales?.length ?? 0) > 0;
  const isLoading = policies === undefined && sales === undefined;

  const openSaleEdit = (sale: NonNullable<typeof sales>[number]) => {
    setEditingSale({
      _id: sale._id,
      carrierId: sale.carrierId,
      saleTypeId: sale.saleTypeId,
      policyNumber: sale.policyNumber,
      effectiveDate: sale.effectiveDate,
      term: sale.term,
      status: sale.status,
      notes: sale.notes,
      lineItems: sale.lineItems.map((li) => ({
        productId: li.productId,
        premium: li.premium,
      })),
      coverages: sale.coverages,
    });
    setSaleEditOpen(true);
  };

  const handleSaleDelete = async () => {
    if (!deletingSaleId) return;
    try {
      await removeSale({ id: deletingSaleId });
      setSaleDeleteOpen(false);
      setDeletingSaleId(null);
    } catch (err) {
      console.error("Failed to delete sale:", err);
    }
  };

  const toggleExpand = (saleId: string) => {
    setExpandedSaleId((prev) => (prev === saleId ? null : saleId));
  };

  const handleCarrierClick = async (e: React.MouseEvent, sale: NonNullable<typeof sales>[number]) => {
    const url = (sale as any).carrierUrl;
    e.preventDefault();

    // Copy policy number or contact name to clipboard
    const clipText = sale.policyNumber
      ? sale.policyNumber
      : `${contact.firstName} ${contact.lastName}`;
    try {
      await navigator.clipboard.writeText(clipText);
      setCopiedPolicyId(sale._id);
      setTimeout(() => setCopiedPolicyId(null), 2500);
    } catch {
      // Clipboard not available, still open the portal
    }

    // Send search data to Chrome extension via both methods:
    // 1. postMessage — picked up by content script if already injected
    // 2. localStorage — polled by content script as a fallback
    const searchData = {
      policyNumber: sale.policyNumber || "",
      contactName: `${contact.firstName} ${contact.lastName}`,
      carrierName: sale.carrierName,
      timestamp: Date.now(),
    };
    window.postMessage({ type: "CRM_CARRIER_SEARCH", payload: searchData }, "*");
    try { localStorage.setItem("crm-carrier-search", JSON.stringify(searchData)); } catch {}

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Policies</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => { setEditingPolicy(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search policies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 px-4 pb-4">
          {!isLoading && !hasResults && (
            <p className="text-sm text-muted-foreground text-center py-8">No policies found</p>
          )}

          {/* Sales (from sales table) */}
          {filteredSales?.map((sale) => {
            const isExpanded = expandedSaleId === sale._id;
            const isHovered = hoveredSaleId === sale._id;

            return (
              <div
                key={sale._id}
                className="rounded-lg border overflow-hidden"
                onMouseEnter={() => setHoveredSaleId(sale._id)}
                onMouseLeave={() => setHoveredSaleId(null)}
              >
                {/* Summary row */}
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <a
                        href={(sale as any).carrierUrl || "#"}
                        onClick={(e) => handleCarrierClick(e, sale)}
                        className="text-sm font-medium leading-tight text-primary hover:underline cursor-pointer"
                      >
                        {sale.carrierName}
                      </a>
                      {sale.policyNumber && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <p className="text-xs text-muted-foreground">#{sale.policyNumber}</p>
                          {copiedPolicyId === sale._id && (
                            <span className="flex items-center gap-0.5 text-xs text-green-600 animate-in fade-in duration-200">
                              <ClipboardCheck className="h-3 w-3" /> Copied
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {sale.status}
                      </Badge>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openSaleEdit(sale)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setDeletingSaleId(sale._id);
                                setSaleDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sale.lineItems.map((item) => (
                      <Badge key={item._id} variant="outline" className="text-xs px-1.5 py-0">
                        {item.productName}
                      </Badge>
                    ))}
                    <span className="text-xs font-medium text-muted-foreground">
                      {formatCurrency(sale.totalPremium)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Eff: {new Date(sale.effectiveDate).toLocaleDateString()}
                    {" - "}
                    Exp: {new Date(sale.endDate).toLocaleDateString()}
                  </p>
                </div>

                {/* Expand arrow - visible on hover or when expanded */}
                <div
                  className={cn(
                    "flex justify-center transition-all duration-200",
                    isHovered || isExpanded ? "opacity-100 h-5" : "opacity-0 h-0 overflow-hidden"
                  )}
                >
                  <button
                    onClick={() => toggleExpand(sale._id)}
                    className="flex items-center justify-center w-8 h-5 rounded-b-md text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>
                </div>

                {/* Expanded details */}
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200 ease-in-out",
                    isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div className="px-3 pb-3 pt-1 border-t border-border/40 mx-2.5">
                    <div className="space-y-1.5 text-xs">
                      {/* Policy Details */}
                      {sale.saleTypeName && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sale Type</span>
                          <span className="font-medium">{sale.saleTypeName}</span>
                        </div>
                      )}
                      {sale.policyNumber && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Policy Number</span>
                          <span className="font-medium">#{sale.policyNumber}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {sale.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Carrier</span>
                        <a
                          href={(sale as any).carrierUrl || "#"}
                          onClick={(e) => handleCarrierClick(e, sale)}
                          className="font-medium text-primary hover:underline cursor-pointer"
                        >
                          {sale.carrierName}
                        </a>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lines of Business</span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {sale.lineItems.map((item) => (
                            <Badge key={item._id} variant="outline" className="text-xs px-1.5 py-0">
                              {item.productName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Premium</span>
                        <span className="font-medium">{formatCurrency(sale.totalPremium)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Effective Date</span>
                        <span className="font-medium">{new Date(sale.effectiveDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expiration Date</span>
                        <span className="font-medium">{new Date(sale.endDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Agent</span>
                        <span className="font-medium">{sale.userName}</span>
                      </div>

                      {/* Coverages - dynamic from product definitions, ordered by field definition */}
                      {(() => {
                        const coverages = (sale.coverages as Record<string, string>) ?? {};
                        const filledKeys = Object.keys(coverages).filter((k) => coverages[k]);
                        if (filledKeys.length === 0) return null;

                        // Build ordered field list from line items' coverage field definitions
                        const orderedFields: { key: string; label: string; type?: string }[] = [];
                        const seen = new Set<string>();
                        for (const item of sale.lineItems) {
                          for (const cf of ((item as any).coverageFields ?? [])) {
                            if (!seen.has(cf.key)) {
                              seen.add(cf.key);
                              orderedFields.push({ key: cf.key, label: cf.label, type: cf.type });
                            }
                          }
                        }
                        // Append any stored keys not in definitions (legacy data)
                        for (const key of filledKeys) {
                          if (!seen.has(key)) {
                            orderedFields.push({ key, label: formatKey(key) });
                          }
                        }

                        const formatValue = (key: string, value: string, fieldType?: string) => {
                          if (fieldType === "currency" && !value.startsWith("$")) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          }
                          if (fieldType === "number") {
                            const num = parseFloat(value);
                            if (!isNaN(num)) return num.toLocaleString("en-US");
                          }
                          return value;
                        };

                        return (
                          <>
                            <div className="border-t border-border/40 pt-1.5 mt-1.5">
                              <span className="text-xs font-semibold text-muted-foreground">Coverages</span>
                            </div>
                            {orderedFields.map((field) => {
                              const value = coverages[field.key];
                              if (!value) return null;
                              return (
                                <div key={field.key} className="flex justify-between">
                                  <span className="text-muted-foreground">{field.label}</span>
                                  <span className="font-medium">{formatValue(field.key, value, field.type)}</span>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Manual policies (from policies table) */}
          {filteredPolicies?.map((policy) => (
            <div key={policy._id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium leading-tight">{policy.carrier}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">#{policy.policyNumber}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditingPolicy(policy); setDialogOpen(true); }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => removePolicy({ id: policy._id })}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {policy.status}
                </Badge>
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {typeLabels[policy.type]}
                </Badge>
                {policy.premiumAmount != null && (
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(policy.premiumAmount)}/{policy.premiumFrequency || "annual"}
                  </span>
                )}
              </div>
              {(policy.effectiveDate || policy.expirationDate) && (
                <p className="text-xs text-muted-foreground">
                  {policy.effectiveDate && `Eff: ${new Date(policy.effectiveDate).toLocaleDateString()}`}
                  {policy.effectiveDate && policy.expirationDate && " - "}
                  {policy.expirationDate && `Exp: ${new Date(policy.expirationDate).toLocaleDateString()}`}
                </p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Manual policy form dialog */}
      <PolicyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        policy={editingPolicy}
        contactId={contact._id}
        organizationId={organizationId}
        userId={userId}
      />

      {/* Sale edit dialog (full form) */}
      <SaleFormDialog
        open={saleEditOpen}
        onOpenChange={(open) => {
          setSaleEditOpen(open);
          if (!open) setEditingSale(undefined);
        }}
        contact={contact}
        organizationId={organizationId}
        editSale={editingSale}
      />

      {/* Sale Delete Confirmation */}
      <Dialog open={saleDeleteOpen} onOpenChange={(open) => { if (!open) { setSaleDeleteOpen(false); setDeletingSaleId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sale</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sale and all its line items? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSaleDeleteOpen(false); setDeletingSaleId(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSaleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
