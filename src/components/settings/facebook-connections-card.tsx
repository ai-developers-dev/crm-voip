"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Facebook, Loader2, Plug, Unplug } from "lucide-react";

/**
 * Facebook Lead Ads — connection management card.
 *
 * Mounted inside a SettingsRow on the per-tenant settings page. Three
 * UI states:
 *
 *   1. Connections list — current connected Pages + Connect button.
 *   2. Multi-page checklist dialog (auto-opens when ?fb_pick=<state>
 *      lands in the URL after the OAuth callback redirects back).
 *   3. Error banner from ?fb_error=<msg>.
 *
 * Plumbs the OAuth flow:
 *   Connect btn → POST /api/facebook/connect → returns authUrl →
 *   window.location.href = authUrl → user authorizes on Meta →
 *   Meta redirects to /api/facebook/callback → Convex completeOAuth
 *   stores pending row → callback redirects user back here with
 *   ?fb_pick=<state> → checklist opens → user picks pages →
 *   confirmConnections action fetches page tokens + subscribes →
 *   connections appear in list via Convex subscription.
 */
export function FacebookConnectionsCard({
  organizationId,
}: {
  organizationId: Id<"organizations">;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fbPick = searchParams.get("fb_pick");
  const fbError = searchParams.get("fb_error");

  const connections = useQuery(api.facebook.listForOrg, { organizationId });
  const pending = useQuery(
    api.facebook.listPendingByState,
    fbPick ? { organizationId, state: fbPick } : "skip",
  );
  const disconnect = useMutation(api.facebook.disconnect);
  const confirmConnections = useAction(
    api.facebookActions.confirmConnections,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(
    new Set(),
  );
  const [connecting, setConnecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    fbError ? decodeURIComponent(fbError) : null,
  );

  // Auto-open the picker the moment the callback redirects back with
  // ?fb_pick=<state> AND the pending row has loaded.
  useEffect(() => {
    if (fbPick && pending && pending.pages.length > 0 && !pickerOpen) {
      setPickerOpen(true);
      // Pre-tick everything; users can untick what they don't want.
      setSelectedPageIds(new Set(pending.pages.map((p) => p.pageId)));
    }
  }, [fbPick, pending, pickerOpen]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/facebook/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          // Where to land after the OAuth round-trip. Bring users
          // back to the same Settings page they kicked off from.
          redirectPath: window.location.pathname,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Connect failed (${res.status})`);
      }
      const { authUrl } = (await res.json()) as { authUrl: string };
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConnecting(false);
    }
  };

  const handleConfirm = async () => {
    if (!fbPick) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await confirmConnections({
        organizationId,
        state: fbPick,
        selectedPageIds: Array.from(selectedPageIds),
      });
      setPickerOpen(false);
      setSelectedPageIds(new Set());
      // Strip ?fb_pick from the URL so re-opening the page later
      // doesn't relaunch the picker dialog.
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("fb_pick");
      sp.delete("fb_error");
      const qs = sp.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname);
      if (result.errors.length > 0) {
        setError(
          `Connected ${result.connected}; ${result.errors.length} failed: ${result.errors
            .map((e) => `${e.pageId}: ${e.message}`)
            .join("; ")}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async (
    connectionId: Id<"facebookConnections">,
  ) => {
    if (!confirm("Disconnect this Facebook Page? Lead Ads will stop syncing.")) {
      return;
    }
    try {
      await disconnect({ connectionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePage = (pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Connect a Facebook Business Page to sync Lead Ads form
        submissions into Contacts. Submitted leads land as new
        contacts and trigger any <code>contact_created</code>{" "}
        workflows you have configured.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      {/* Connections list */}
      {connections === undefined ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading connections…
        </div>
      ) : connections.length === 0 ? (
        <div className="text-sm text-on-surface-variant italic">
          No Pages connected yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {connections.map((c) => (
            <li
              key={c._id}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <Facebook className="h-4 w-4 text-blue-600" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {c.pageName}
                </div>
                <div className="text-xs text-on-surface-variant">
                  {c.status === "active" && (
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <CheckCircle2 className="h-3 w-3" /> Active
                      {c.lastSyncAt && (
                        <span className="text-on-surface-variant ml-2">
                          last sync{" "}
                          {new Date(c.lastSyncAt).toLocaleTimeString()}
                        </span>
                      )}
                    </span>
                  )}
                  {c.status === "error" && (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertCircle className="h-3 w-3" />{" "}
                      {c.errorMessage ?? "Error"}
                    </span>
                  )}
                  {c.status === "disconnected" && (
                    <Badge variant="outline">Disconnected</Badge>
                  )}
                </div>
              </div>
              {c.status !== "disconnected" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDisconnect(c._id)}
                >
                  <Unplug className="h-4 w-4 mr-1" /> Disconnect
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button onClick={handleConnect} disabled={connecting}>
        {connecting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plug className="h-4 w-4 mr-2" />
        )}
        Connect Facebook Page
      </Button>

      {/* Multi-page checklist dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick Pages to connect</DialogTitle>
            <DialogDescription>
              Tick every Page you want Lead Ads to sync from. You can
              connect more later.
            </DialogDescription>
          </DialogHeader>
          {pending === undefined ? (
            <div className="flex items-center gap-2 py-4 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pages…
            </div>
          ) : pending === null ? (
            <div className="py-4 text-sm text-amber-700">
              This connect flow has expired. Close this dialog and
              click Connect again.
            </div>
          ) : (
            <ul className="space-y-2 py-2 max-h-80 overflow-y-auto">
              {pending.pages.map((p) => (
                <li
                  key={p.pageId}
                  className="flex items-center gap-3 rounded-md border border-border p-2"
                >
                  <Checkbox
                    id={`fbp-${p.pageId}`}
                    checked={selectedPageIds.has(p.pageId)}
                    onCheckedChange={() => togglePage(p.pageId)}
                  />
                  <label
                    htmlFor={`fbp-${p.pageId}`}
                    className="flex-1 text-sm cursor-pointer"
                  >
                    {p.pageName}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPickerOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={submitting || selectedPageIds.size === 0 || !pending}
            >
              {submitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Connect {selectedPageIds.size}{" "}
              {selectedPageIds.size === 1 ? "Page" : "Pages"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
