"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Phone,
  Clock,
  ExternalLink,
} from "lucide-react";
import { callDirectionColors } from "@/lib/style-constants";
import { useOptionalCallingContext } from "./calling-provider";
import { toE164, formatPhoneDashed } from "@/lib/phone";
import { BlockNumberDialog } from "./block-number-dialog";

interface DailyCallLogProps {
  organizationId: Id<"organizations">;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// Local-timezone midnight as ms-since-epoch. Memoized on the local
// calendar-date string so the Convex query subscription is stable
// across renders, but rolls over correctly if the tab is left open
// past midnight. `new Date("Mon Apr 28 2026")` parses as midnight
// local of that date — exactly what we want.
function useLocalTodayStartMs(): number {
  const dateKey = new Date().toDateString(); // e.g. "Mon Apr 28 2026"
  return useMemo(() => new Date(dateKey).getTime(), [dateKey]);
}

export function DailyCallLog({ organizationId }: DailyCallLogProps) {
  const router = useRouter();
  const sinceMs = useLocalTodayStartMs();
  const callLog = useQuery(api.callStats.getDailyCallLog, {
    organizationId,
    sinceMs,
  });
  const callingContext = useOptionalCallingContext();
  // Number that opens the block/unblock dialog. The dialog itself
  // queries `isBlocked` so it shows the right action (Block vs Unblock)
  // without the row having to know.
  const [blockTarget, setBlockTarget] = useState<string | null>(null);

  if (callLog === undefined) {
    return (
      <div className="py-4 text-center text-sm text-on-surface-variant">
        Loading call log...
      </div>
    );
  }

  if (callLog.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-on-surface-variant">
        No calls today
      </div>
    );
  }

  return (
    <>
    <div className="divide-y">
      {callLog.map((call) => {
        const isMissed = call.outcome === "missed";
        const isInbound = call.direction === "inbound";
        const hasContact = !!call.contactId;

        // Resolve display name and the underlying phone number.
        // `nameDisplay` is what we'd show if we have a contact match;
        // when we don't, we show the dashed phone number instead so
        // long E.164 strings don't overflow the row. Click opens the
        // block dialog.
        const otherPartyNumber = isInbound ? call.from : call.to;
        const isDialable =
          !!otherPartyNumber && !otherPartyNumber.startsWith("client:");
        const canCallBack = isDialable && !!callingContext?.isReady;

        const contactOrName = isInbound
          ? call.contactName || call.fromName
          : call.contactName || call.toName;
        const callerDisplay = contactOrName
          ? contactOrName
          : isDialable
            ? formatPhoneDashed(otherPartyNumber!)
            : (isInbound ? call.from : call.to);
        const isJustNumber = !contactOrName && isDialable;

        const handleCallBack = async (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!callingContext || !otherPartyNumber) return;
          const e164 = toE164(otherPartyNumber) ?? otherPartyNumber;
          try {
            await callingContext.makeCall(e164);
          } catch (err) {
            console.error("Call-back failed:", err);
          }
        };

        return (
          <div
            key={call._id}
            className={`flex items-center gap-3 px-3 py-2 ${
              hasContact
                ? "cursor-pointer hover:bg-surface-container-high/50 transition-colors"
                : ""
            }`}
            onClick={() => {
              if (hasContact) {
                router.push(`/contacts?id=${call.contactId}`);
              }
            }}
          >
            {/* Direction/outcome icon */}
            <div className="shrink-0">
              {isMissed ? (
                <PhoneMissed className={`h-4 w-4 ${callDirectionColors.missed.icon}`} />
              ) : isInbound ? (
                <PhoneIncoming className={`h-4 w-4 ${callDirectionColors.inbound.icon}`} />
              ) : (
                <PhoneOutgoing className={`h-4 w-4 ${callDirectionColors.outbound.icon}`} />
              )}
            </div>

            {/* Caller info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {isJustNumber && otherPartyNumber ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBlockTarget(otherPartyNumber);
                    }}
                    title={`Block or unblock ${callerDisplay}`}
                    className={`text-sm font-medium truncate text-left hover:underline ${
                      isMissed ? callDirectionColors.missedText : ""
                    }`}
                  >
                    {callerDisplay}
                  </button>
                ) : (
                  <span
                    className={`text-sm font-medium truncate ${
                      isMissed ? callDirectionColors.missedText : ""
                    }`}
                  >
                    {callerDisplay}
                  </span>
                )}
                {hasContact && (
                  <ExternalLink className="h-3 w-3 text-on-surface-variant shrink-0" />
                )}
              </div>
              {/* Handler + outcome */}
              <div className="text-xs text-on-surface-variant truncate">
                {isMissed
                  ? "Missed"
                  : call.handledByName
                    ? `Answered by ${call.handledByName}`
                    : call.outcome === "voicemail"
                      ? "Voicemail"
                      : call.outcome}
              </div>
            </div>

            {/* Click-to-call — shown for any row with a dialable number.
                stopPropagation so it doesn't also trigger the row-click
                navigate-to-contact behavior. */}
            {canCallBack && (
              <button
                type="button"
                onClick={handleCallBack}
                title={`Call ${otherPartyNumber}`}
                aria-label={`Call ${otherPartyNumber}`}
                className="shrink-0 rounded-full bg-green-500 hover:bg-green-600 text-white h-7 w-7 flex items-center justify-center transition-colors"
              >
                <Phone className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Duration */}
            <div className="shrink-0 text-xs text-on-surface-variant text-right">
              {call.talkTime && call.talkTime > 0 ? (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(call.talkTime)}
                </div>
              ) : (
                <span>{isMissed ? "—" : "0s"}</span>
              )}
            </div>

            {/* Time */}
            <div className="shrink-0 text-xs text-on-surface-variant w-16 text-right">
              {format(new Date(call.startedAt), "h:mm a")}
            </div>
          </div>
        );
      })}
    </div>
    <BlockNumberDialog
      open={!!blockTarget}
      onOpenChange={(open) => {
        if (!open) setBlockTarget(null);
      }}
      organizationId={organizationId}
      phoneNumber={blockTarget ?? ""}
    />
    </>
  );
}
