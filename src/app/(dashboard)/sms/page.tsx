"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Settings } from "lucide-react";
import Link from "next/link";
import { useState, useCallback, useEffect } from "react";

import { ConversationList, Conversation } from "@/components/sms/conversation-list";
import { MessageThread, MessageThreadEmpty, Message } from "@/components/sms/message-thread";
import { MessageComposer, MessageComposerDisabled } from "@/components/sms/message-composer";
import { NewConversationDialog } from "@/components/sms/new-conversation-dialog";

export default function SMSPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);

  const org = useQuery(
    api.organizations.getByClerkId,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const phoneNumbers = useQuery(
    api.phoneNumbers.getByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const conversations = useQuery(
    api.sms.getConversations,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const messages = useQuery(
    api.sms.getMessages,
    selectedConversation?._id ? { conversationId: selectedConversation._id } : "skip"
  );

  const markAsRead = useMutation(api.sms.markAsRead);
  const archiveConversation = useMutation(api.sms.archiveConversation);
  const markAsSpam = useMutation(api.sms.markAsSpam);
  const reactivateConversation = useMutation(api.sms.reactivateConversation);

  const businessPhoneNumber = phoneNumbers?.[0]?.phoneNumber || "";

  useEffect(() => {
    if (selectedConversation && selectedConversation.unreadCount > 0) {
      markAsRead({ conversationId: selectedConversation._id });
    }
  }, [selectedConversation, markAsRead]);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
  }, []);

  const handleSendMessage = useCallback(async (messageBody: string, mediaUrls?: string[]) => {
    if (!selectedConversation || !org?._id) return;

    const response = await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: selectedConversation.customerPhoneNumber,
        messageBody,
        mediaUrls,
        organizationId: org._id,
        fromNumber: selectedConversation.businessPhoneNumber,
      }),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to send message");
    }
  }, [selectedConversation, org?._id]);

  const handleSendNewConversation = useCallback(async (to: string, messageBody: string) => {
    if (!org?._id || !businessPhoneNumber) {
      throw new Error("No phone number configured");
    }

    const response = await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        messageBody,
        organizationId: org._id,
        fromNumber: businessPhoneNumber,
      }),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to send message");
    }

    setTimeout(() => {
      const newConv = conversations?.find(
        (c) => c.customerPhoneNumber === to && c.businessPhoneNumber === businessPhoneNumber
      );
      if (newConv) setSelectedConversation(newConv);
    }, 500);
  }, [org?._id, businessPhoneNumber, conversations]);

  const handleArchive = useCallback(async () => {
    if (!selectedConversation) return;
    await archiveConversation({ conversationId: selectedConversation._id });
    setSelectedConversation(null);
  }, [selectedConversation, archiveConversation]);

  const handleMarkSpam = useCallback(async () => {
    if (!selectedConversation) return;
    await markAsSpam({ conversationId: selectedConversation._id });
    setSelectedConversation(null);
  }, [selectedConversation, markAsSpam]);

  const handleReactivate = useCallback(async () => {
    if (!selectedConversation) return;
    await reactivateConversation({ conversationId: selectedConversation._id });
  }, [selectedConversation, reactivateConversation]);

  if (!orgLoaded || org === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (!businessPhoneNumber) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Phone Number</CardTitle>
            <CardDescription>
              Your organization doesn't have a phone number configured. SMS requires an active phone number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings">
              <Button className="w-full">
                <Settings className="h-4 w-4 mr-2" />
                Configure Phone Number
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height))]">
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 flex-shrink-0">
          <ConversationList
            conversations={conversations || []}
            selectedConversationId={selectedConversation?._id}
            onSelectConversation={handleSelectConversation}
            onNewConversation={() => setShowNewConversationDialog(true)}
          />
        </div>
        <div className="flex-1 flex flex-col">
          {selectedConversation && messages ? (
            <>
              <MessageThread
                conversation={selectedConversation}
                messages={messages as Message[]}
                onArchive={handleArchive}
                onMarkSpam={handleMarkSpam}
                onReactivate={handleReactivate}
              />
              <MessageComposer onSend={handleSendMessage} />
            </>
          ) : (
            <>
              <div className="flex-1">
                <MessageThreadEmpty />
              </div>
              <MessageComposerDisabled />
            </>
          )}
        </div>
      </div>

      <NewConversationDialog
        open={showNewConversationDialog}
        onOpenChange={setShowNewConversationDialog}
        onSend={handleSendNewConversation}
        fromNumber={businessPhoneNumber}
      />
    </div>
  );
}
