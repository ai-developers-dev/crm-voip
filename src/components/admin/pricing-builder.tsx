"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Trash2, CheckCircle, AlertCircle,
  RefreshCw, DollarSign, X,
  Phone, MessageSquare, Users, Calendar, BarChart3,
  Workflow, Columns3, BrainCircuit,
} from "lucide-react";

// ── Platform Features ─────────────────────────────────────────────────
const PLATFORM_FEATURES = [
  { key: "calls", label: "Calls", icon: Phone, description: "Inbound & outbound VoIP calling" },
  { key: "sms", label: "SMS", icon: MessageSquare, description: "Two-way text messaging" },
  { key: "contacts", label: "Contacts", icon: Users, description: "Contact management & CRM" },
  { key: "calendar", label: "Calendar", icon: Calendar, description: "Appointments & scheduling" },
  { key: "reports", label: "Reports", icon: BarChart3, description: "Sales & call reporting" },
  { key: "workflows", label: "Workflows", icon: Workflow, description: "Automated workflow engine" },
  { key: "pipelines", label: "Pipelines", icon: Columns3, description: "Sales pipeline management" },
  { key: "ai_calling", label: "AI Voice Agents", icon: Phone, description: "AI-powered outbound calling" },
  { key: "ai_sms", label: "AI SMS Agents", icon: BrainCircuit, description: "AI-powered SMS conversations" },
] as const;

function FeatureIcon({ featureKey, className }: { featureKey: string; className?: string }) {
  const feature = PLATFORM_FEATURES.find(f => f.key === featureKey);
  if (!feature) return <DollarSign className={className} />;
  const Icon = feature.icon;
  return <Icon className={className} />;
}

function featureLabel(key: string): string {
  return PLATFORM_FEATURES.find(f => f.key === key)?.label || key;
}

// ── Types ─────────────────────────────────────────────────────────────
interface AddonItem {
  id: string;
  name: string;
  features: string[];
  priceMonthly: number;
  includedInBase: boolean;
}

export function PricingBuilder() {
  const plan = useQuery(api.pricing.getActivePlan);
  const addons = useQuery(api.pricing.getAllAddons);
  const upsertPlan = useMutation(api.pricing.upsertPlan);
  const seedAddons = useMutation(api.pricing.seedDefaultAddons);
  const createAddon = useMutation(api.pricing.createAddon);
  const removeAddonMut = useMutation(api.pricing.removeAddon);

  // Plan state
  const [planName, setPlanName] = useState("Professional");
  const [planDesc, setPlanDesc] = useState("Everything you need to grow your agency");
  const [basePrice, setBasePrice] = useState(97);
  const [perUserPrice, setPerUserPrice] = useState(47);
  const [includedUsers, setIncludedUsers] = useState(1);
  const [trialDays, setTrialDays] = useState(14);
  const [maxUsers, setMaxUsers] = useState<number | "">("");
  const [maxContacts, setMaxContacts] = useState<number | "">("");
  const [maxCallMinutes, setMaxCallMinutes] = useState<number | "">("");
  const [maxWorkflows, setMaxWorkflows] = useState<number | "">("");

  // Add-ons (unified — each has an "includedInBase" toggle)
  const [addonItems, setAddonItems] = useState<AddonItem[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate plan from DB
  useEffect(() => {
    if (plan) {
      setPlanName(plan.name);
      setPlanDesc(plan.description || "");
      setBasePrice(plan.basePriceMonthly);
      setPerUserPrice(plan.perUserPrice);
      setIncludedUsers(plan.includedUsers);
      setTrialDays(plan.trialDays);
      setMaxUsers(plan.maxUsers ?? "");
      setMaxContacts(plan.maxContacts ?? "");
      setMaxCallMinutes(plan.maxDailyCallMinutes ?? "");
      setMaxWorkflows(plan.maxWorkflows ?? "");
    }
  }, [plan]);

  // Hydrate addons from DB
  useEffect(() => {
    if (!addons || addons.length === 0) return;

    // Group addons by name (multi-feature groups share name)
    const groupMap = new Map<string, AddonItem>();
    for (const addon of addons) {
      const existing = groupMap.get(addon.name);
      if (existing) {
        existing.features.push(addon.featureKey);
      } else {
        groupMap.set(addon.name, {
          id: addon._id,
          name: addon.name,
          features: [addon.featureKey],
          priceMonthly: addon.priceMonthly,
          includedInBase: !!addon.isIncludedInBase,
        });
      }
    }
    setAddonItems([...groupMap.values()]);
  }, [addons]);

  // Seed if empty
  useEffect(() => {
    if (addons !== undefined && addons.length === 0) {
      seedAddons();
    }
  }, [addons, seedAddons]);

  // All features already assigned to an addon
  const assignedFeatures = new Set(addonItems.flatMap(a => a.features));
  const availableFeatures = PLATFORM_FEATURES.filter(f => !assignedFeatures.has(f.key));

  // ── Handlers ────────────────────────────────────────────────────────
  const addAddonItem = () => {
    setAddonItems(prev => [
      ...prev,
      { id: `new-${Date.now()}`, name: "", features: [], priceMonthly: 0, includedInBase: false },
    ]);
  };

  const updateAddonItem = (idx: number, updates: Partial<AddonItem>) => {
    setAddonItems(prev => prev.map((a, i) => i === idx ? { ...a, ...updates } : a));
  };

  const toggleIncludedInBase = (idx: number) => {
    setAddonItems(prev => prev.map((a, i) =>
      i === idx ? { ...a, includedInBase: !a.includedInBase, priceMonthly: !a.includedInBase ? 0 : a.priceMonthly } : a
    ));
  };

  const addFeatureToAddon = (idx: number, key: string) => {
    setAddonItems(prev => prev.map((a, i) =>
      i === idx ? { ...a, features: [...a.features, key] } : a
    ));
  };

  const removeFeatureFromAddon = (idx: number, key: string) => {
    setAddonItems(prev => prev.map((a, i) =>
      i === idx ? { ...a, features: a.features.filter(f => f !== key) } : a
    ));
  };

  const removeAddonItem = (idx: number) => {
    setAddonItems(prev => prev.filter((_, i) => i !== idx));
  };

  // Features available for a specific addon dropdown
  const featuresAvailableFor = (addonIdx: number) => {
    const otherAssigned = new Set(
      addonItems.flatMap((a, i) => i === addonIdx ? [] : a.features)
    );
    return PLATFORM_FEATURES.filter(f => !otherAssigned.has(f.key));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. Save plan
      await upsertPlan({
        id: plan?._id,
        name: planName,
        description: planDesc || undefined,
        basePriceMonthly: basePrice,
        perUserPrice,
        includedUsers,
        trialDays,
        maxUsers: maxUsers === "" ? undefined : maxUsers,
        maxContacts: maxContacts === "" ? undefined : maxContacts,
        maxDailyCallMinutes: maxCallMinutes === "" ? undefined : maxCallMinutes,
        maxWorkflows: maxWorkflows === "" ? undefined : maxWorkflows,
      });

      // 2. Delete all existing addons
      if (addons) {
        for (const existing of addons) {
          await removeAddonMut({ id: existing._id });
        }
      }

      // 3. Recreate from current state
      for (const item of addonItems) {
        if (item.features.length === 0) continue;

        for (let i = 0; i < item.features.length; i++) {
          const key = item.features[i];
          const feat = PLATFORM_FEATURES.find(f => f.key === key);
          await createAddon({
            name: item.name || feat?.label || key,
            description: feat?.description,
            priceMonthly: i === 0 ? (item.includedInBase ? 0 : item.priceMonthly) : 0,
            category: item.includedInBase ? "base" : "paid",
            icon: key,
            featureKey: key,
            isIncludedInBase: item.includedInBase,
          });
        }
      }

      setSuccess("Pricing saved!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSyncStripe = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/stripe/sync-pricing", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSuccess("Synced to Stripe! Products and prices updated.");
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || "Stripe sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // Separate included vs paid for summary
  const includedCount = addonItems.filter(a => a.includedInBase).length;
  const paidCount = addonItems.filter(a => !a.includedInBase && a.priceMonthly > 0).length;

  return (
    <div className="space-y-6">
      {/* Status */}
      {success && (
        <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
          <CheckCircle className="h-4 w-4" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive font-medium">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* ── Base Plan ──────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Base Plan</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Plan Name</Label>
            <Input value={planName} onChange={(e) => setPlanName(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-3">
          <div>
            <Label className="text-xs">Base Price ($/mo)</Label>
            <Input type="number" min={0} value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Per User ($/mo)</Label>
            <Input type="number" min={0} value={perUserPrice} onChange={(e) => setPerUserPrice(Number(e.target.value))} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Included Users</Label>
            <Input type="number" min={1} value={includedUsers} onChange={(e) => setIncludedUsers(Number(e.target.value))} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Trial Days</Label>
            <Input type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} className="h-9 text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* ── Add-Ons ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Add-Ons</h3>
          <Button variant="outline" size="sm" onClick={addAddonItem}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Add-On
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          {includedCount} included in base, {paidCount} paid. Check "Include in base plan" to make an add-on free.
        </p>

        {addonItems.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg">
            No add-ons configured. Click "Add Add-On" to create one.
          </p>
        )}

        <div className="space-y-3">
          {addonItems.map((item, idx) => {
            const groupAvailable = featuresAvailableFor(idx);
            return (
              <div key={item.id} className="rounded-lg border p-3 space-y-2.5">
                {/* Row 1: Name + Price + Delete */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Input
                      value={item.name}
                      onChange={(e) => updateAddonItem(idx, { name: e.target.value })}
                      placeholder="Add-on name (e.g., Communication Bundle)"
                      className="h-8 text-sm"
                    />
                  </div>
                  {!item.includedInBase && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        min={0}
                        value={item.priceMonthly}
                        onChange={(e) => updateAddonItem(idx, { priceMonthly: Number(e.target.value) })}
                        className="h-8 text-sm w-20"
                      />
                      <span className="text-xs text-muted-foreground">/mo</span>
                    </div>
                  )}
                  {item.includedInBase && (
                    <Badge variant="secondary" className="shrink-0 text-xs">Included — $0</Badge>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={() => removeAddonItem(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Row 2: Include in base checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={item.includedInBase}
                    onCheckedChange={() => toggleIncludedInBase(idx)}
                  />
                  <span className="text-xs">Include in base plan (no extra charge)</span>
                </label>

                {/* Row 3: Features */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  {item.features.map(key => (
                    <Badge key={key} variant="outline" className="gap-1.5 pl-2 pr-1 py-0.5 text-xs">
                      <FeatureIcon featureKey={key} className="h-3 w-3" />
                      {featureLabel(key)}
                      <button onClick={() => removeFeatureFromAddon(idx, key)} className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}

                  {groupAvailable.length > 0 && (
                    <Select onValueChange={(v) => addFeatureToAddon(idx, v)} value="">
                      <SelectTrigger className="h-6 text-[10px] w-32 border-dashed">
                        <SelectValue placeholder="+ Add feature" />
                      </SelectTrigger>
                      <SelectContent>
                        {groupAvailable.map(f => (
                          <SelectItem key={f.key} value={f.key}>
                            <span className="flex items-center gap-2">
                              <f.icon className="h-3.5 w-3.5" />
                              {f.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Feature Limits ─────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Feature Limits</h3>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Max Users</Label>
            <Input type="number" min={0} placeholder="Unlimited" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value ? Number(e.target.value) : "")} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Max Contacts</Label>
            <Input type="number" min={0} placeholder="Unlimited" value={maxContacts} onChange={(e) => setMaxContacts(e.target.value ? Number(e.target.value) : "")} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Max Call Min/Day</Label>
            <Input type="number" min={0} placeholder="Unlimited" value={maxCallMinutes} onChange={(e) => setMaxCallMinutes(e.target.value ? Number(e.target.value) : "")} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Max Workflows</Label>
            <Input type="number" min={0} placeholder="Unlimited" value={maxWorkflows} onChange={(e) => setMaxWorkflows(e.target.value ? Number(e.target.value) : "")} className="h-9 text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Pricing
          </Button>
          <Button variant="outline" onClick={handleSyncStripe} disabled={syncing || !plan}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync to Stripe
          </Button>
        </div>
        {plan?.stripeProductId && (
          <p className="text-[10px] text-muted-foreground">
            Stripe: {plan.stripeProductId.slice(0, 24)}...
          </p>
        )}
      </div>
    </div>
  );
}
