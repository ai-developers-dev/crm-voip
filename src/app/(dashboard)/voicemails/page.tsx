"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { layout, typography } from "@/lib/style-constants";
import { format } from "date-fns";
import { Voicemail, Phone, Clock, User, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export default function VoicemailsPage() {
  const { organization } = useOrganization();

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const voicemails = useQuery(
    api.voicemails.list,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const unreadCount = useQuery(
    api.voicemails.getUnreadCount,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const markRead = useMutation(api.voicemails.markRead);

  const handleMarkRead = async (voicemailId: Id<"voicemails">) => {
    await markRead({ voicemailId });
  };

  // Loading
  if (!convexOrg || voicemails === undefined) {
    return (
      <div className={layout.centerState}>
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  return (
    <div className={layout.scrollPage}>
      {/* Page header */}
      <div className="flex items-center gap-3">
        <h1 className={typography.pageTitle}>Voicemails</h1>
        {unreadCount !== undefined && unreadCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {unreadCount} unread
          </Badge>
        )}
      </div>

      {/* Empty state */}
      {voicemails.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-surface-container p-4 mb-4">
            <Voicemail className="h-8 w-8 text-on-surface-variant" />
          </div>
          <h3 className="text-sm font-medium">No Voicemails</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Voicemails from missed calls will appear here.
          </p>
        </div>
      )}

      {/* Voicemail list */}
      {voicemails.length > 0 && (
        <div className="space-y-2">
          {voicemails.map((vm) => (
            <button
              type="button"
              key={vm._id}
              onClick={() => {
                if (!vm.isRead) handleMarkRead(vm._id);
              }}
              className={`w-full text-left rounded-xl border p-4 transition-colors hover:bg-surface-container/50 ${
                !vm.isRead
                  ? "bg-primary/5 border-primary/20"
                  : "bg-background border-border"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    !vm.isRead
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  <Voicemail className="h-5 w-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-sm truncate ${
                          !vm.isRead ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {vm.callerName || vm.callerNumber}
                      </span>
                      {vm.callerName && (
                        <span className="text-xs text-on-surface-variant flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {vm.callerNumber}
                        </span>
                      )}
                      {!vm.isRead && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-on-surface-variant whitespace-nowrap">
                      {format(new Date(vm.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(vm.duration)}
                    </span>
                    {vm.contactId && (
                      <Link
                        href={`/contacts?id=${vm.contactId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <User className="h-3 w-3" />
                        View Contact
                      </Link>
                    )}
                  </div>

                  {/* Audio player */}
                  <div className="mt-2">
                    <audio
                      controls
                      preload="none"
                      className="h-8 w-full max-w-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <source src={vm.recordingUrl} type="audio/mpeg" />
                    </audio>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
