"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useOptionalCallingContext } from "./calling-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DispositionDialog
 *
 * Mounts once in the dashboard layout. Listens for `crm:call-ended` window
 * events dispatched from use-twilio-device.ts's disconnect handlers. When
 * fired with a `callHistoryId`, opens a non-dismissable modal so the user
 * must pick a disposition before doing anything else.
 */
export function DispositionDialog() {
  const callingContext = useOptionalCallingContext();
  const organizationId = callingContext?.convexOrgId;

  const [callHistoryId, setCallHistoryId] = useState<Id<"callHistory"> | null>(null);
  const [selected, setSelected] = useState<Id<"callDispositions"> | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const dispositions = useQuery(
    api.callDispositions.listEnabledForOrg,
    organizationId ? { organizationId } : "skip",
  );
  const saveForCall = useMutation(api.callDispositions.saveForCall);

  // Listen for call-ended events dispatched from the SDK disconnect handlers.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        callHistoryId?: Id<"callHistory">;
      } | undefined;
      console.log("[dispo-dbg] crm:call-ended received, detail:", detail);
      if (detail?.callHistoryId) {
        console.log("[dispo-dbg] opening dialog for callHistoryId:", detail.callHistoryId);
        setCallHistoryId(detail.callHistoryId);
        setSelected(null);
        setNotes("");
      } else {
        console.warn("[dispo-dbg] event fired but no callHistoryId — dialog stays closed");
      }
    };
    window.addEventListener("crm:call-ended", handler);
    console.log("[dispo-dbg] listener mounted. orgId:", organizationId);
    return () => window.removeEventListener("crm:call-ended", handler);
  }, [organizationId]);

  if (!callHistoryId || !organizationId) return null;

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await saveForCall({
        callHistoryId,
        dispositionId: selected,
        notes: notes.trim() || undefined,
      });
      setCallHistoryId(null);
    } catch (err) {
      console.error("Failed to save disposition:", err);
      alert("Could not save disposition. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!callHistoryId}
      onOpenChange={(open) => {
        // Non-dismissable — clicking outside or pressing Esc doesn't close.
        if (!open && !saving && selected) return;
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>How did that call go?</DialogTitle>
          <DialogDescription>
            Pick a disposition so this call is logged accurately. Required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {dispositions === undefined ? (
            <div className="flex items-center justify-center py-6 text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading…
            </div>
          ) : dispositions.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-3">
              No dispositions configured. An admin must set these in Settings.
            </p>
          ) : (
            dispositions.map((d) => (
              <button
                key={d._id}
                type="button"
                onClick={() => setSelected(d._id)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 text-sm transition-all",
                  selected === d._id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "hover:bg-surface-container/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{d.label}</span>
                  {d.category && (
                    <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                      {d.category.replace("_", " ")}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">
            Notes (optional)
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any details worth keeping with this call…"
            className="min-h-18 text-sm"
          />
        </div>

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!selected || saving}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Save disposition"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
