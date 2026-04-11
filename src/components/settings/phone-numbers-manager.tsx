"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Phone, Search, Loader2, Trash2, Plus, PhoneCall, MessageSquare,
  ToggleLeft, ToggleRight, AlertCircle, Settings, Settings2, RefreshCw,
} from "lucide-react";
import { PhoneRoutingDialog } from "./phone-routing-dialog";
import { PhoneNumberTwilioConfigDialog } from "./phone-number-twilio-config-dialog";
import { refreshTenantPhoneNumberWebhookUrls } from "@/app/(dashboard)/admin/actions";

interface PhoneNumbersManagerProps {
  organizationId: Id<"organizations">;
  /**
   * If true, shows the platform-admin-only "Refresh Webhook URLs" button
   * and the Twilio config gear icon on each number row. Pass true only from
   * the admin tenant view, not tenant self-service.
   */
  isPlatformAdmin?: boolean;
}

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  capabilities?: { voice: boolean; sms: boolean; mms: boolean };
}

export function PhoneNumbersManager({ organizationId, isPlatformAdmin = false }: PhoneNumbersManagerProps) {
  const phoneNumbers = useQuery(api.phoneNumbers.getByOrganization, { organizationId });

  // Twilio config dialog state (platform admin only)
  const [twilioConfigTarget, setTwilioConfigTarget] = useState<Doc<"phoneNumbers"> | null>(null);

  // Refresh webhook URLs state (platform admin only)
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleRefreshWebhookUrls = async () => {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const result = await refreshTenantPhoneNumberWebhookUrls(organizationId);
      if (result.success) {
        setRefreshMessage({
          type: "success",
          text: result.message || "Webhook URLs refreshed",
        });
      } else {
        setRefreshMessage({
          type: "error",
          text: result.error || "Failed to refresh webhook URLs",
        });
      }
      // Auto-clear after 5s
      setTimeout(() => setRefreshMessage(null), 5000);
    } catch (err) {
      setRefreshMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Unexpected error",
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Buy number dialog
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [areaCode, setAreaCode] = useState("");
  const [numberType, setNumberType] = useState<"local" | "tollFree">("local");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AvailableNumber[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // Release confirmation
  const [releaseTarget, setReleaseTarget] = useState<{ id: string; number: string } | null>(null);
  const [releasing, setReleasing] = useState(false);

  // Toggle active
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Routing dialog
  const [routingPhone, setRoutingPhone] = useState<any>(null);

  const handleSearch = async () => {
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const params = new URLSearchParams({
        organizationId,
        type: numberType,
      });
      if (areaCode.trim()) params.set("areaCode", areaCode.trim());

      const res = await fetch(`/api/twilio/numbers?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setSearchResults(data.numbers || []);
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handlePurchase = async (phoneNumber: string) => {
    setPurchasing(phoneNumber);
    try {
      const res = await fetch("/api/twilio/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      // Remove from search results
      setSearchResults((prev) => prev.filter((n) => n.phoneNumber !== phoneNumber));
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setPurchasing(null);
    }
  };

  const handleRelease = async () => {
    if (!releaseTarget) return;
    setReleasing(true);
    try {
      const params = new URLSearchParams({
        organizationId,
        phoneNumberId: releaseTarget.id,
      });
      const res = await fetch(`/api/twilio/numbers?${params}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Release failed");
      setReleaseTarget(null);
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setReleasing(false);
    }
  };

  const handleToggleActive = async (phoneNumberId: string, currentActive: boolean) => {
    setTogglingId(phoneNumberId);
    try {
      const res = await fetch("/api/twilio/numbers/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId, isActive: !currentActive }),
      });
      // Fallback: use convex mutation directly if toggle endpoint doesn't exist
      if (!res.ok) {
        // Silently fail the toggle — the convex subscription will keep the UI in sync
      }
    } catch {
      // Ignore errors for now
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="section-heading">Phone Numbers</h4>
        <div className="flex items-center gap-2">
          {isPlatformAdmin && phoneNumbers && phoneNumbers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshWebhookUrls}
              disabled={refreshing}
              title="Re-sync every phone number's webhook URLs to match NEXT_PUBLIC_APP_URL"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh Webhook URLs
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setBuyDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Buy Number
          </Button>
        </div>
      </div>

      {refreshMessage && (
        <div
          className={`rounded-md border p-2 text-xs ${
            refreshMessage.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {refreshMessage.text}
        </div>
      )}

      {/* Current phone numbers list */}
      {!phoneNumbers ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading numbers...
        </div>
      ) : phoneNumbers.length === 0 ? (
        <div className="text-center py-6 text-sm text-on-surface-variant border border-dashed rounded-md">
          <Phone className="h-8 w-8 mx-auto mb-2 text-on-surface-variant/50" />
          <p>No phone numbers yet.</p>
          <p className="caption-text">Buy a number to start making calls.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {phoneNumbers.map((num) => {
            const routingLabel = num.routingType === "direct" ? "Direct" : num.routingType === "ring_group" ? "Ring Group" : "Ring All";
            return (
              <div
                key={num._id}
                className="flex items-center gap-3 border rounded-md px-3 py-2.5 text-sm"
              >
                <Phone className="h-4 w-4 text-on-surface-variant shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-medium">{num.phoneNumber}</div>
                  <div className="text-xs text-on-surface-variant truncate">
                    {num.friendlyName} · <span className="capitalize">{num.type}</span> · {routingLabel}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                    {routingLabel}
                  </Badge>
                  <Badge variant={num.isActive ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                    {num.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setRoutingPhone(num)}
                  title="Edit Routing"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
                {isPlatformAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setTwilioConfigTarget(num)}
                    title="Edit Twilio Config (platform admin)"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => setReleaseTarget({ id: num._id, number: num.phoneNumber })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Buy Number Dialog */}
      <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buy Phone Number</DialogTitle>
            <DialogDescription>
              Search for available phone numbers and purchase one for your organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Area Code</Label>
                <Input
                  placeholder="e.g. 415"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  className="h-9 text-sm"
                  maxLength={3}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <div className="flex gap-1">
                  <Button
                    variant={numberType === "local" ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    onClick={() => setNumberType("local")}
                  >
                    Local
                  </Button>
                  <Button
                    variant={numberType === "tollFree" ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    onClick={() => setNumberType("tollFree")}
                  >
                    Toll-Free
                  </Button>
                </div>
              </div>
              <div className="self-end">
                <Button size="sm" className="h-9" onClick={handleSearch} disabled={searching}>
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-1" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>

            {searchError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {searchError}
              </div>
            )}

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                {searchResults.map((num) => (
                  <div key={num.phoneNumber} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <span className="font-mono font-medium">{num.friendlyName || num.phoneNumber}</span>
                      {num.locality && (
                        <span className="caption-text ml-2">
                          {num.locality}, {num.region}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={purchasing === num.phoneNumber}
                      onClick={() => handlePurchase(num.phoneNumber)}
                    >
                      {purchasing === num.phoneNumber ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Purchase"
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {!searching && searchResults.length === 0 && !searchError && (
              <p className="text-sm text-on-surface-variant text-center py-4">
                Enter an area code and click Search to find available numbers.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release Confirmation Dialog */}
      <Dialog open={!!releaseTarget} onOpenChange={(open) => { if (!open) setReleaseTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Phone Number</DialogTitle>
            <DialogDescription>
              Are you sure you want to release <span className="font-mono font-medium">{releaseTarget?.number}</span>?
              This will remove the number from your account permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseTarget(null)} disabled={releasing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRelease} disabled={releasing}>
              {releasing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Release Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phone Routing Dialog */}
      <PhoneRoutingDialog
        open={!!routingPhone}
        onOpenChange={(open) => { if (!open) setRoutingPhone(null); }}
        phoneNumber={routingPhone}
        organizationId={organizationId}
      />

      {/* Twilio Config Dialog — platform admin only */}
      {isPlatformAdmin && (
        <PhoneNumberTwilioConfigDialog
          open={!!twilioConfigTarget}
          onOpenChange={(open) => { if (!open) setTwilioConfigTarget(null); }}
          phoneNumber={twilioConfigTarget}
        />
      )}
    </div>
  );
}
