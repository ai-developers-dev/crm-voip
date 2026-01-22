"use client";

import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  MoreVertical,
  Archive,
  Trash2,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { Conversation } from "./conversation-list";

export interface Message {
  _id: Id<"messages">;
  organizationId: Id<"organizations">;
  twilioMessageSid: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  body: string;
  mediaUrls?: string[];
  status: "queued" | "sending" | "sent" | "delivered" | "failed" | "undelivered";
  errorCode?: string;
  errorMessage?: string;
  conversationId?: Id<"conversations">;
  contactId?: Id<"contacts">;
  segmentCount: number;
  sentAt: number;
  deliveredAt?: number;
  readAt?: number;
  createdAt: number;
}

interface MessageThreadProps {
  conversation: Conversation;
  messages: Message[];
  onArchive: () => void;
  onMarkSpam: () => void;
  onReactivate: () => void;
}

export function MessageThread({
  conversation,
  messages,
  onArchive,
  onMarkSpam,
  onReactivate,
}: MessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Format time for message
  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isYesterday) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }

    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Status icon for outbound messages
  const StatusIcon = ({ status }: { status: Message["status"] }) => {
    switch (status) {
      case "queued":
      case "sending":
        return <Clock className="h-3 w-3 text-muted-foreground" />;
      case "sent":
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case "failed":
      case "undelivered":
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  messages.forEach((message) => {
    const messageDate = new Date(message.sentAt).toLocaleDateString();
    if (messageDate !== currentDate) {
      currentDate = messageDate;
      groupedMessages.push({ date: messageDate, messages: [] });
    }
    groupedMessages[groupedMessages.length - 1].messages.push(message);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Thread Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold">
            {conversation.contactName ||
              formatPhoneDisplay(conversation.customerPhoneNumber)}
          </h3>
          {conversation.contactName && (
            <p className="text-sm text-muted-foreground">
              {formatPhoneDisplay(conversation.customerPhoneNumber)}
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {conversation.status === "active" ? (
              <>
                <DropdownMenuItem onClick={onArchive}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive conversation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMarkSpam} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Mark as spam
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={onReactivate}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Move to inbox
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date Divider */}
            <div className="flex items-center justify-center my-4">
              <span className="text-xs text-muted-foreground bg-background px-2">
                {new Date(group.date).toLocaleDateString([], {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>

            {/* Messages for this date */}
            {group.messages.map((message) => (
              <div
                key={message._id}
                className={cn(
                  "flex flex-col max-w-[75%] mb-3",
                  message.direction === "outbound" ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                {/* Message Bubble */}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2",
                    message.direction === "outbound"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
                  )}
                >
                  {/* Media Attachments */}
                  {message.mediaUrls && message.mediaUrls.length > 0 && (
                    <div className="mb-2 space-y-2">
                      {message.mediaUrls.map((url, idx) => (
                        <div key={idx} className="relative">
                          {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={url}
                                alt="MMS attachment"
                                className="max-w-full rounded-lg max-h-64 object-cover"
                              />
                            </a>
                          ) : (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm underline"
                            >
                              <ImageIcon className="h-4 w-4" />
                              Attachment {idx + 1}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Body */}
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                </div>

                {/* Message Meta */}
                <div className="flex items-center gap-1 mt-1 px-1">
                  <span className="text-xs text-muted-foreground">
                    {formatMessageTime(message.sentAt)}
                  </span>

                  {/* Status for outbound */}
                  {message.direction === "outbound" && (
                    <StatusIcon status={message.status} />
                  )}

                  {/* Segment count if > 1 */}
                  {message.segmentCount > 1 && (
                    <span className="text-xs text-muted-foreground">
                      ({message.segmentCount} segments)
                    </span>
                  )}
                </div>

                {/* Error message for failed */}
                {(message.status === "failed" || message.status === "undelivered") &&
                  message.errorMessage && (
                    <div className="mt-1 px-1">
                      <span className="text-xs text-destructive">
                        {message.errorMessage}
                      </span>
                    </div>
                  )}
              </div>
            ))}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

// Empty state when no conversation is selected
export function MessageThreadEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3 className="font-medium text-lg">No conversation selected</h3>
      <p className="text-sm mt-1">
        Select a conversation from the list or start a new one
      </p>
    </div>
  );
}
