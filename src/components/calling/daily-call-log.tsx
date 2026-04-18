"use client";

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
import { toE164 } from "@/lib/phone";

interface DailyCallLogProps {
  organizationId: Id<"organizations">;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function DailyCallLog({ organizationId }: DailyCallLogProps) {
  const router = useRouter();
  const callLog = useQuery(api.callStats.getDailyCallLog, { organizationId });
  const callingContext = useOptionalCallingContext();

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
    <div className="divide-y">
      {callLog.map((call) => {
        const isMissed = call.outcome === "missed";
        const isInbound = call.direction === "inbound";
        const hasContact = !!call.contactId;

        // Determine display name/number
        const callerDisplay = isInbound
          ? call.contactName || call.fromName || call.from
          : call.contactName || call.toName || call.to;

        // For outbound calls the other party is `to`; for inbound it's `from`.
        // Skip browser-client identities ("client:…") — those aren't dialable.
        const otherPartyNumber = isInbound ? call.from : call.to;
        const isDialable =
          !!otherPartyNumber && !otherPartyNumber.startsWith("client:");
        const canCallBack = isDialable && !!callingContext?.isReady;

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
                <span
                  className={`text-sm font-medium truncate ${
                    isMissed ? callDirectionColors.missedText : ""
                  }`}
                >
                  {callerDisplay}
                </span>
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
  );
}
