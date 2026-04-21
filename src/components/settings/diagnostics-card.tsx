"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";

/**
 * Diagnostics — one-off admin actions exposed in the tenant settings
 * page. Currently just "Clear stuck calls", which flushes any
 * `activeCalls` rows that failed to clean up (historically caused by
 * the dual-leg CallSid mismatch or dropped Twilio webhooks) so the
 * per-user "on call" card on the tenant dashboard clears and the
 * agent's presence flips back to "available".
 *
 * The underlying mutation (`calls.clearStuckActiveCalls`) moves each
 * stuck row into `callHistory` with outcome "failed" for audit, and
 * requires `authorizeOrgAdmin` — platform admins and tenant admins
 * only.
 */
export function DiagnosticsCard({
  organizationId,
}: {
  organizationId: Id<"organizations">;
}) {
  const clearStuckActiveCalls = useMutation(api.calls.clearStuckActiveCalls);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<
    { cleared: number } | { error: string } | null
  >(null);

  const handleClear = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await clearStuckActiveCalls({
        organizationId,
        olderThanMinutes: 10,
      });
      setResult({ cleared: res.clearedCount });
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-on-surface-variant">
        Clear active-call rows older than 10 minutes. Use this if a
        previous call never closed out cleanly and an agent is still
        shown as &ldquo;On Call&rdquo; on the dashboard. Each cleared
        row is moved to call history with outcome <em>failed</em>.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClear}
        disabled={running}
      >
        {running ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Clearing…
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 mr-2" />
            Clear stuck calls (older than 10 min)
          </>
        )}
      </Button>
      {result && "cleared" in result && (
        <p className="text-sm text-green-700">
          {result.cleared === 0
            ? "No stuck calls found."
            : `Cleared ${result.cleared} stuck call${
                result.cleared === 1 ? "" : "s"
              }.`}
        </p>
      )}
      {result && "error" in result && (
        <p className="text-sm text-red-700">Error: {result.error}</p>
      )}
    </div>
  );
}
