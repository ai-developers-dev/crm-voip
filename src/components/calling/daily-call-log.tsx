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
  User,
  Clock,
  ExternalLink,
} from "lucide-react";
import { callDirectionColors } from "@/lib/style-constants";

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

  if (callLog === undefined) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        Loading call log...
      </div>
    );
  }

  if (callLog.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
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

        return (
          <div
            key={call._id}
            className={`flex items-center gap-3 px-3 py-2 ${
              hasContact
                ? "cursor-pointer hover:bg-muted/50 transition-colors"
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
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </div>
              {/* Handler + outcome */}
              <div className="text-xs text-muted-foreground truncate">
                {isMissed
                  ? "Missed"
                  : call.handledByName
                    ? `Answered by ${call.handledByName}`
                    : call.outcome === "voicemail"
                      ? "Voicemail"
                      : call.outcome}
              </div>
            </div>

            {/* Duration */}
            <div className="shrink-0 text-xs text-muted-foreground text-right">
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
            <div className="shrink-0 text-xs text-muted-foreground w-16 text-right">
              {format(new Date(call.startedAt), "h:mm a")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
