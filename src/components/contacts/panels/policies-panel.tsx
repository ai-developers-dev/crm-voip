"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { X, Plus, Search, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PolicyFormDialog } from "./policy-form-dialog";

interface PolicysPanelProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  home: "Home",
  auto: "Auto",
  life: "Life",
  health: "Health",
  umbrella: "Umbrella",
  commercial: "Commercial",
  other: "Other",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  expired: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

export function PoliciesPanel({ contact, organizationId, userId, onClose }: PolicysPanelProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Doc<"policies"> | null>(null);

  const policies = useQuery(api.policies.getByContact, { contactId: contact._id });
  const removePolicy = useMutation(api.policies.remove);

  const filtered = policies?.filter((p) =>
    `${p.policyNumber} ${p.carrier}`.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">Policies</h3>
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
          {filtered?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No policies found</p>
          )}
          {filtered?.map((policy) => (
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
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColors[policy.status]}`}>
                  {policy.status}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {typeLabels[policy.type]}
                </Badge>
                {policy.premiumAmount != null && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatCurrency(policy.premiumAmount)}/{policy.premiumFrequency || "annual"}
                  </span>
                )}
              </div>
              {(policy.effectiveDate || policy.expirationDate) && (
                <p className="text-[10px] text-muted-foreground">
                  {policy.effectiveDate && `Eff: ${new Date(policy.effectiveDate).toLocaleDateString()}`}
                  {policy.effectiveDate && policy.expirationDate && " - "}
                  {policy.expirationDate && `Exp: ${new Date(policy.expirationDate).toLocaleDateString()}`}
                </p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <PolicyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        policy={editingPolicy}
        contactId={contact._id}
        organizationId={organizationId}
        userId={userId}
      />
    </div>
  );
}
