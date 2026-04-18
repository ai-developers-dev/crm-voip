"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PolicyType = "home" | "auto" | "life" | "health" | "umbrella" | "commercial" | "other";
type PolicyStatus = "active" | "pending" | "expired" | "cancelled";
type PremiumFrequency = "monthly" | "quarterly" | "semi_annual" | "annual";

interface PolicyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: Doc<"policies"> | null;
  contactId: Id<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
}

export function PolicyFormDialog({ open, onOpenChange, policy, contactId, organizationId, userId }: PolicyFormDialogProps) {
  const createPolicy = useMutation(api.policies.create);
  const updatePolicy = useMutation(api.policies.update);

  const [policyNumber, setPolicyNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [type, setType] = useState<PolicyType>("auto");
  const [status, setStatus] = useState<PolicyStatus>("active");
  const [premiumAmount, setPremiumAmount] = useState("");
  const [premiumFrequency, setPremiumFrequency] = useState<PremiumFrequency>("monthly");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      if (policy) {
        setPolicyNumber(policy.policyNumber);
        setCarrier(policy.carrier);
        setType(policy.type);
        setStatus(policy.status);
        setPremiumAmount(policy.premiumAmount?.toString() || "");
        setPremiumFrequency(policy.premiumFrequency || "monthly");
        setEffectiveDate(policy.effectiveDate ? new Date(policy.effectiveDate).toISOString().slice(0, 10) : "");
        setExpirationDate(policy.expirationDate ? new Date(policy.expirationDate).toISOString().slice(0, 10) : "");
        setDescription(policy.description || "");
      } else {
        setPolicyNumber("");
        setCarrier("");
        setType("auto");
        setStatus("active");
        setPremiumAmount("");
        setPremiumFrequency("monthly");
        setEffectiveDate("");
        setExpirationDate("");
        setDescription("");
      }
    }
  }, [open, policy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyNumber.trim() || !carrier.trim() || (!policy && !userId)) return;

    const premium = premiumAmount ? parseFloat(premiumAmount) : undefined;
    const effDate = effectiveDate ? new Date(effectiveDate).getTime() : undefined;
    const expDate = expirationDate ? new Date(expirationDate).getTime() : undefined;

    if (policy) {
      await updatePolicy({
        id: policy._id,
        policyNumber: policyNumber.trim(),
        carrier: carrier.trim(),
        type,
        status,
        premiumAmount: premium,
        premiumFrequency: premiumAmount ? premiumFrequency : undefined,
        effectiveDate: effDate,
        expirationDate: expDate,
        description: description.trim() || undefined,
      });
    } else {
      await createPolicy({
        organizationId,
        contactId,
        policyNumber: policyNumber.trim(),
        carrier: carrier.trim(),
        type,
        premiumAmount: premium,
        premiumFrequency: premiumAmount ? premiumFrequency : undefined,
        effectiveDate: effDate,
        expirationDate: expDate,
        description: description.trim() || undefined,
        createdByUserId: userId!,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{policy ? "Edit Policy" : "New Policy"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="policyNumber">Policy Number</Label>
              <Input id="policyNumber" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="carrier">Carrier</Label>
              <Input id="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PolicyType)}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="life">Life</SelectItem>
                  <SelectItem value="health">Health</SelectItem>
                  <SelectItem value="umbrella">Umbrella</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {policy && (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as PolicyStatus)}>
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="premium">Premium</Label>
              <Input id="premium" type="number" step="0.01" value={premiumAmount} onChange={(e) => setPremiumAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <Select value={premiumFrequency} onValueChange={(v) => setPremiumFrequency(v as PremiumFrequency)}>
                <SelectTrigger id="frequency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="effectiveDate">Effective Date</Label>
              <Input id="effectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expirationDate">Expiration Date</Label>
              <Input id="expirationDate" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{policy ? "Save" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
