"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, PhoneIncoming, PhoneOutgoing, PhoneMissed, MessageSquare, ArrowDownLeft, ArrowUpRight, MessageCircle, Mail, MailOpen, ChevronRight, StopCircle, Ban } from "lucide-react";
import { ContactActionBar } from "./contact-action-bar";
import { ComposeBox } from "./compose-box";
import { commTypeColors } from "@/lib/style-constants";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { WorkflowDialog } from "@/components/workflows/workflow-dialog";

type Contact = Doc<"contacts">;

interface CommunicationsPaneProps {
  contact: Contact | null;
  organizationId: Id<"organizations">;
}

type WorkflowInfo = {
  workflowName: string;
  workflowId: string;
  nextStepLabel: string | null;
  executionStatus: string;
  executionId: string;
};

type CommunicationItem = {
  id: string;
  type: "call" | "sms" | "email";
  direction: "inbound" | "outbound";
  timestamp: number;
  // Call fields
  outcome?: string;
  duration?: number;
  recordingUrl?: string;
  callHistoryId?: Id<"callHistory">;
  dispositionLabel?: string;
  phoneNumber?: string;
  // SMS fields
  body?: string;
  status?: string;
  // Email fields
  subject?: string;
  snippet?: string;
  // Workflow fields
  workflowExecutionId?: string;
  workflowInfo?: WorkflowInfo;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getDateGroup(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function CommunicationIcon({ item }: { item: CommunicationItem }) {
  if (item.type === "call") {
    if (item.outcome === "missed") {
      const colors = commTypeColors["call-missed"];
      return (
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${colors.bg}`}>
          <PhoneMissed className={`h-4 w-4 ${colors.icon}`} />
        </div>
      );
    }
    if (item.direction === "inbound") {
      const colors = commTypeColors["call-inbound"];
      return (
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${colors.bg}`}>
          <PhoneIncoming className={`h-4 w-4 ${colors.icon}`} />
        </div>
      );
    }
    const colors = commTypeColors["call-outbound"];
    return (
      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${colors.bg}`}>
        <PhoneOutgoing className={`h-4 w-4 ${colors.icon}`} />
      </div>
    );
  }

  // Email
  if (item.type === "email") {
    if (item.direction === "inbound") {
      const colors = commTypeColors["email-inbound"];
      return (
        <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${colors.bg}`}>
          <MailOpen className={`h-4 w-4 ${colors.icon}`} />
        </div>
      );
    }
    const colors = commTypeColors["email-outbound"];
    return (
      <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${colors.bg}`}>
        <Mail className={`h-4 w-4 ${colors.icon}`} />
      </div>
    );
  }

  // SMS
  if (item.direction === "inbound") {
    const colors = commTypeColors["sms-inbound"];
    return (
      <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${colors.bg}`}>
        <MessageSquare className={`h-4 w-4 ${colors.icon}`} />
        <ArrowDownLeft className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 ${colors.icon}`} />
      </div>
    );
  }
  const colors = commTypeColors["sms-outbound"];
  return (
    <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${colors.bg}`}>
      <MessageSquare className={`h-4 w-4 ${colors.icon}`} />
      <ArrowUpRight className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 ${colors.icon}`} />
    </div>
  );
}

function WorkflowBadge({ info, onOpenWorkflow, onStopWorkflow }: {
  info: WorkflowInfo;
  onOpenWorkflow?: (workflowId: string) => void;
  onStopWorkflow?: (executionId: string) => void;
}) {
  const isRunning = info.executionStatus === "running";
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => onOpenWorkflow?.(info.workflowId)}
          className="flex h-5 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30 text-[9px] font-bold text-violet-600 dark:text-violet-400 cursor-pointer hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors shrink-0"
        >
          WF
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="left" align="start" className="w-56 p-3">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onOpenWorkflow?.(info.workflowId)}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline cursor-pointer w-full text-left"
          >
            {info.workflowName}
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </button>
          {info.nextStepLabel && (
            <div className="text-xs text-on-surface-variant">
              <span className="font-medium text-on-surface">Next:</span> {info.nextStepLabel}
            </div>
          )}
          {!info.nextStepLabel && (
            <div className="text-xs text-on-surface-variant">Workflow completed</div>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onStopWorkflow?.(info.executionId); }}
              className="flex items-center gap-1.5 w-full text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md px-2 py-1.5 transition-colors cursor-pointer"
            >
              <StopCircle className="h-3.5 w-3.5" />
              Stop Workflow
            </button>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function CommunicationItemRow({ item, onOpenWorkflow, onStopWorkflow }: {
  item: CommunicationItem;
  onOpenWorkflow?: (workflowId: string) => void;
  onStopWorkflow?: (executionId: string) => void;
}) {
  const getLabel = () => {
    if (item.type === "call") {
      if (item.outcome === "missed") return "Missed Call";
      return item.direction === "inbound" ? "Incoming Call" : "Outgoing Call";
    }
    if (item.type === "email") {
      return item.direction === "inbound" ? "Email Received" : "Email Sent";
    }
    return item.direction === "inbound" ? "SMS Received" : "SMS Sent";
  };

  const getDetails = () => {
    if (item.type === "call") {
      const parts: string[] = [];
      if (item.phoneNumber) parts.push(formatPhoneDisplay(item.phoneNumber));
      if (item.outcome === "missed") {
        parts.push("Not answered");
      } else if (item.duration !== undefined) {
        parts.push(formatDuration(item.duration));
      } else {
        parts.push("Connected");
      }
      return parts.join(" · ");
    }
    if (item.type === "email") {
      const parts = [];
      if (item.subject) parts.push(item.subject);
      if (item.snippet) parts.push(`— ${item.snippet}`);
      const text = parts.join(" ");
      return text.length > 80 ? `${text.slice(0, 80)}...` : text;
    }
    // SMS - show preview
    if (item.body) {
      return item.body.length > 50 ? `"${item.body.slice(0, 50)}..."` : `"${item.body}"`;
    }
    return "";
  };

  return (
    <div className="relative flex items-start gap-3 py-3">
      <CommunicationIcon item={item} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{getLabel()}</span>
          <div className="flex items-center gap-1.5">
            {item.workflowInfo && (
              <WorkflowBadge info={item.workflowInfo} onOpenWorkflow={onOpenWorkflow} onStopWorkflow={onStopWorkflow} />
            )}
            <span className="text-xs text-on-surface-variant">{formatTime(item.timestamp)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-on-surface-variant truncate">{getDetails()}</p>
          {item.type === "call" && item.dispositionLabel && (
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {item.dispositionLabel}
            </span>
          )}
        </div>
        {item.type === "call" && item.recordingUrl && item.callHistoryId && (
          <div className="mt-1.5">
            {/* Stream through the app so Twilio Basic auth can be attached —
                browser <audio> can't send auth headers, so a raw Twilio URL
                fails silently. */}
            <audio controls preload="none" className="h-8 w-full max-w-xs">
              <source
                src={`/api/twilio/recording/stream?callId=${item.callHistoryId}`}
                type="audio/mpeg"
              />
            </audio>
          </div>
        )}
      </div>
    </div>
  );
}

export function CommunicationsPane({ contact, organizationId }: CommunicationsPaneProps) {
  const [workflowDialogId, setWorkflowDialogId] = useState<string | null>(null);
  const cancelExecution = useMutation(api.workflowExecutions.cancel);

  // Fetch communications for the selected contact
  const history = useQuery(
    api.contacts.getCommunicationsHistory,
    contact ? { contactId: contact._id, organizationId } : "skip"
  );

  // Fetch workflow for dialog if one is selected
  const workflows = useQuery(api.workflows.getByOrganization, { organizationId });
  const selectedWorkflow = workflows?.find((w) => w._id === workflowDialogId) ?? null;

  // Merge and sort communications by timestamp
  const groupedCommunications = useMemo(() => {
    if (!history) return {};

    const items: CommunicationItem[] = [];

    // Map calls
    for (const call of history.calls) {
      items.push({
        id: `call-${call._id}`,
        type: "call",
        direction: call.direction,
        timestamp: call.startedAt,
        outcome: call.outcome,
        duration: call.talkTime || call.duration,
        recordingUrl: call.recordingUrl,
        callHistoryId: call._id,
        dispositionLabel: call.dispositionLabel,
        // For outbound calls we show the number dialed; for inbound, who called.
        phoneNumber: call.direction === "outbound" ? call.to : call.from,
      });
    }

    // Map messages
    for (const msg of history.messages) {
      const rawWfInfo = msg.workflowExecutionId && history.workflowInfo
        ? history.workflowInfo[msg.workflowExecutionId]
        : undefined;
      const wfInfo = rawWfInfo ? { ...rawWfInfo, executionId: msg.workflowExecutionId! } : undefined;
      items.push({
        id: `sms-${msg._id}`,
        type: "sms",
        direction: msg.direction,
        timestamp: msg.sentAt,
        body: msg.body,
        status: msg.status,
        workflowExecutionId: msg.workflowExecutionId,
        workflowInfo: wfInfo,
      });
    }

    // Map emails
    if (history.emails) {
      for (const email of history.emails) {
        items.push({
          id: `email-${email._id}`,
          type: "email",
          direction: email.direction as "inbound" | "outbound",
          timestamp: email.sentAt,
          subject: email.subject,
          snippet: email.snippet,
        });
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Group by date
    const groups: Record<string, CommunicationItem[]> = {};
    for (const item of items) {
      const group = getDateGroup(item.timestamp);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(item);
    }

    return groups;
  }, [history]);

  // No contact selected
  if (!contact) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-8">
        <div className="rounded-full bg-surface-container p-4 mb-4">
          <MessageCircle className="h-8 w-8 text-on-surface-variant" />
        </div>
        <h3 className="text-sm font-medium">Select a Contact</h3>
        <p className="text-on-surface-variant mt-1 max-w-sm">
          Choose a contact from the list to view their communication history including calls and messages.
        </p>
      </div>
    );
  }

  // Loading state
  if (history === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  const hasItems = Object.keys(groupedCommunications).length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold">Communications</h2>
            <p className="text-sm text-on-surface-variant">
              {contact.firstName} {contact.lastName}
            </p>
          </div>
          <ContactActionBar contact={contact} organizationId={organizationId} />
        </div>
      </div>

      {/* SMS opt-out banner */}
      {contact?.smsOptedOut && (
        <div className="flex items-center gap-2 mx-4 mt-3 px-3 py-2 rounded-xl bg-amber-500/10">
          <Ban className="h-4 w-4 text-amber-500 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">SMS Opted Out</p>
            <p className="text-[10px] text-on-surface-variant">
              This contact replied STOP{contact.smsOptOutDate ? ` on ${new Date(contact.smsOptOutDate).toLocaleDateString()}` : ""}. They must reply START to re-subscribe.
            </p>
          </div>
        </div>
      )}

      {/* Email opt-out banner */}
      {contact?.emailOptedOut && (
        <div className="flex items-center gap-2 mx-4 mt-2 px-3 py-2 rounded-xl bg-amber-500/10">
          <Ban className="h-4 w-4 text-amber-500 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Email Unsubscribed</p>
            <p className="text-[10px] text-on-surface-variant">
              This contact has unsubscribed from email{contact.emailOptOutDate ? ` on ${new Date(contact.emailOptOutDate).toLocaleDateString()}` : ""}.
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {hasItems ? (
        <ScrollArea className="flex-1">
          <div className="p-4">
            {Object.entries(groupedCommunications).map(([dateGroup, items]) => (
              <div key={dateGroup} className="mb-6 last:mb-0">
                <div className="sticky top-0 bg-background pb-2">
                  <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                    {dateGroup}
                  </span>
                </div>
                <div className="divide-y">
                  {items.map((item) => (
                    <CommunicationItemRow
                      key={item.id}
                      item={item}
                      onOpenWorkflow={(wfId) => setWorkflowDialogId(wfId)}
                      onStopWorkflow={(exId) => cancelExecution({ executionId: exId as Id<"workflowExecutions"> })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
          <div className="rounded-full bg-surface-container p-3 mb-3">
            <MessageCircle className="h-6 w-6 text-on-surface-variant" />
          </div>
          <h3 className="text-sm font-medium">No Communications</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            No calls or messages found for this contact.
          </p>
        </div>
      )}

      {/* Compose Box */}
      <ComposeBox contact={contact} organizationId={organizationId} />

      {/* Workflow Dialog — opened from WF badge */}
      {workflowDialogId && (
        <WorkflowDialog
          key={workflowDialogId}
          open={!!workflowDialogId}
          onOpenChange={(open) => { if (!open) setWorkflowDialogId(null); }}
          workflow={selectedWorkflow}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}
