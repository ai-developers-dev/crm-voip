"use client";

import { formatPhoneDisplay } from "@/lib/utils/phone";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquarePlus, Search, Archive, Trash2 } from "lucide-react";
import { useState } from "react";
import { Id } from "../../../convex/_generated/dataModel";

export interface Conversation {
  _id: Id<"conversations">;
  organizationId: Id<"organizations">;
  customerPhoneNumber: string;
  businessPhoneNumber: string;
  contactId?: Id<"contacts">;
  contactName?: string;
  assignedUserId?: Id<"users">;
  status: "active" | "archived" | "spam";
  lastMessageAt: number;
  lastMessagePreview: string;
  unreadCount: number;
  createdAt: number;
  updatedAt: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId?: Id<"conversations">;
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  showArchived?: boolean;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  showArchived = false,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter conversations based on search and status
  const filteredConversations = conversations.filter((conv) => {
    // Filter by status
    if (!showArchived && conv.status !== "active") {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const phoneMatch = conv.customerPhoneNumber.includes(query);
      const nameMatch = conv.contactName?.toLowerCase().includes(query);
      const previewMatch = conv.lastMessagePreview.toLowerCase().includes(query);
      return phoneMatch || nameMatch || previewMatch;
    }

    return true;
  });

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;

    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Messages</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onNewConversation}
            className="gap-2"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {searchQuery ? "No conversations match your search" : "No conversations yet"}
          </div>
        ) : (
          <div className="divide-y">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation._id}
                onClick={() => onSelectConversation(conversation)}
                className={cn(
                  "w-full p-4 text-left hover:bg-muted/50 transition-colors",
                  selectedConversationId === conversation._id && "bg-muted"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Contact Name or Phone */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {conversation.contactName ||
                          formatPhoneDisplay(conversation.customerPhoneNumber)}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <Badge variant="default" className="h-5 px-1.5 text-xs">
                          {conversation.unreadCount}
                        </Badge>
                      )}
                    </div>

                    {/* Show phone if we have a name */}
                    {conversation.contactName && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatPhoneDisplay(conversation.customerPhoneNumber)}
                      </p>
                    )}

                    {/* Last message preview */}
                    <p
                      className={cn(
                        "text-sm mt-1 truncate",
                        conversation.unreadCount > 0
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {conversation.lastMessagePreview}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(conversation.lastMessageAt)}
                  </span>
                </div>

                {/* Status indicator for archived/spam */}
                {conversation.status !== "active" && (
                  <Badge variant="secondary" className="mt-2 text-xs">
                    {conversation.status === "archived" ? (
                      <>
                        <Archive className="h-3 w-3 mr-1" />
                        Archived
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3 w-3 mr-1" />
                        Spam
                      </>
                    )}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
