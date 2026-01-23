"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, PhoneIncoming, PhoneOutgoing, PhoneMissed, MessageSquare, ArrowDownLeft, ArrowUpRight, MessageCircle } from "lucide-react";

type Contact = Doc<"contacts">;

interface CommunicationsPaneProps {
  contact: Contact | null;
  organizationId: Id<"organizations">;
}

type CommunicationItem = {
  id: string;
  type: "call" | "sms";
  direction: "inbound" | "outbound";
  timestamp: number;
  // Call fields
  outcome?: string;
  duration?: number;
  // SMS fields
  body?: string;
  status?: string;
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
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
          <PhoneMissed className="h-4 w-4 text-red-500" />
        </div>
      );
    }
    if (item.direction === "inbound") {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
          <PhoneIncoming className="h-4 w-4 text-green-600" />
        </div>
      );
    }
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
        <PhoneOutgoing className="h-4 w-4 text-blue-600" />
      </div>
    );
  }

  // SMS
  if (item.direction === "inbound") {
    return (
      <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
        <MessageSquare className="h-4 w-4 text-purple-600" />
        <ArrowDownLeft className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-purple-600" />
      </div>
    );
  }
  return (
    <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
      <MessageSquare className="h-4 w-4 text-indigo-600" />
      <ArrowUpRight className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-indigo-600" />
    </div>
  );
}

function CommunicationItemRow({ item }: { item: CommunicationItem }) {
  const getLabel = () => {
    if (item.type === "call") {
      if (item.outcome === "missed") return "Missed Call";
      return item.direction === "inbound" ? "Incoming Call" : "Outgoing Call";
    }
    return item.direction === "inbound" ? "SMS Received" : "SMS Sent";
  };

  const getDetails = () => {
    if (item.type === "call") {
      if (item.outcome === "missed") return "Not answered";
      if (item.duration !== undefined) return formatDuration(item.duration);
      return "Connected";
    }
    // SMS - show preview
    if (item.body) {
      return item.body.length > 50 ? `"${item.body.slice(0, 50)}..."` : `"${item.body}"`;
    }
    return "";
  };

  return (
    <div className="flex items-start gap-3 py-3">
      <CommunicationIcon item={item} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{getLabel()}</span>
          <span className="text-xs text-muted-foreground">{formatTime(item.timestamp)}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{getDetails()}</p>
      </div>
    </div>
  );
}

export function CommunicationsPane({ contact, organizationId }: CommunicationsPaneProps) {
  // Fetch communications for the selected contact
  const history = useQuery(
    api.contacts.getCommunicationsHistory,
    contact ? { contactId: contact._id, organizationId } : "skip"
  );

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
      });
    }

    // Map messages
    for (const msg of history.messages) {
      items.push({
        id: `sms-${msg._id}`,
        type: "sms",
        direction: msg.direction,
        timestamp: msg.sentAt,
        body: msg.body,
        status: msg.status,
      });
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
        <div className="rounded-full bg-muted p-4 mb-4">
          <MessageCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">Select a Contact</h3>
        <p className="text-muted-foreground mt-1 max-w-sm">
          Choose a contact from the list to view their communication history including calls and messages.
        </p>
      </div>
    );
  }

  // Loading state
  if (history === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasItems = Object.keys(groupedCommunications).length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Communications</h2>
        <p className="text-sm text-muted-foreground">
          {contact.firstName} {contact.lastName}
        </p>
      </div>

      {/* Content */}
      {hasItems ? (
        <ScrollArea className="flex-1">
          <div className="p-4">
            {Object.entries(groupedCommunications).map(([dateGroup, items]) => (
              <div key={dateGroup} className="mb-6 last:mb-0">
                <div className="sticky top-0 bg-background pb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {dateGroup}
                  </span>
                </div>
                <div className="divide-y">
                  {items.map((item) => (
                    <CommunicationItemRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
          <div className="rounded-full bg-muted p-3 mb-3">
            <MessageCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium">No Communications</h3>
          <p className="text-xs text-muted-foreground mt-1">
            No calls or messages found for this contact.
          </p>
        </div>
      )}
    </div>
  );
}
