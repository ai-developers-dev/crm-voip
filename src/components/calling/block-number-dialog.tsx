"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { formatPhoneDashed, toE164 } from "@/lib/phone";

/**
 * Block / unblock a phone number for the current org.
 *
 * Twilio doesn't have a native server-side block list, so blocking is
 * enforced inside our voice webhook (`<Reject reason="busy">`) and our
 * SMS webhook (silent drop). This dialog is just the UI for managing
 * the entries in our `blockedNumbers` Convex table — the webhook
 * checks happen on every inbound call/SMS regardless of whether the
 * dashboard is open.
 */
export function BlockNumberDialog({
  open,
  onOpenChange,
  organizationId,
  phoneNumber, // raw — will be normalized to E.164 before the mutation
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  phoneNumber: string;
}) {
  const e164 = toE164(phoneNumber) ?? phoneNumber;
  const display = formatPhoneDashed(e164);

  const isBlocked = useQuery(
    api.blockedNumbers.isBlocked,
    open ? { organizationId, phoneNumber: e164 } : "skip",
  );
  const blockMutation = useMutation(api.blockedNumbers.block);
  const unblockMutation = useMutation(api.blockedNumbers.unblock);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await blockMutation({
        organizationId,
        phoneNumber: e164,
        reason: reason.trim() || undefined,
      });
      setReason("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUnblock = async () => {
    setBusy(true);
    setError(null);
    try {
      await unblockMutation({ organizationId, phoneNumber: e164 });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const loading = isBlocked === undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isBlocked ? (
              <>
                <ShieldCheck className="h-5 w-5 text-green-600" />
                Unblock {display}
              </>
            ) : (
              <>
                <ShieldAlert className="h-5 w-5 text-red-600" />
                Block {display}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isBlocked
              ? "Future calls and SMS from this number will be allowed again."
              : "Future inbound calls from this number will get a busy signal. Inbound SMS messages will be silently dropped."}
          </DialogDescription>
        </DialogHeader>

        {!isBlocked && !loading && (
          <div className="space-y-2 py-2">
            <Label htmlFor="block-reason">Reason (optional)</Label>
            <Input
              id="block-reason"
              placeholder="e.g. spam, robocall, harassment"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              maxLength={200}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          {loading ? (
            <Button disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading…
            </Button>
          ) : isBlocked ? (
            <Button onClick={handleUnblock} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Unblock
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleBlock}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldAlert className="h-4 w-4 mr-2" />
              )}
              Block number
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
