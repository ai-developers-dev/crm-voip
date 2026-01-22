"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Eye, Loader2, Settings, Phone, MessageSquare, Users, Calendar, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";

import { ConversationList, Conversation } from "@/components/sms/conversation-list";
import { MessageThread, MessageThreadEmpty, Message } from "@/components/sms/message-thread";
import { MessageComposer, MessageComposerDisabled } from "@/components/sms/message-composer";
import { NewConversationDialog } from "@/components/sms/new-conversation-dialog";

export default function TenantSMSPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const tenantId = params.id as string;

  // State
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);

  // Check if user is a platform admin
  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Get the tenant organization by ID
  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  // Get phone numbers for this organization
  const phoneNumbers = useQuery(
    api.phoneNumbers.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  // Get conversations for this organization
  const conversations = useQuery(
    api.sms.getConversations,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  // Get messages for selected conversation
  const messages = useQuery(
    api.sms.getMessages,
    selectedConversation?._id ? { conversationId: selectedConversation._id } : "skip"
  );

  // Mutations
  const markAsRead = useMutation(api.sms.markAsRead);
  const archiveConversation = useMutation(api.sms.archiveConversation);
  const markAsSpam = useMutation(api.sms.markAsSpam);
  const reactivateConversation = useMutation(api.sms.reactivateConversation);

  // Get the business phone number (first available number)
  const businessPhoneNumber = phoneNumbers?.[0]?.phoneNumber || "";

  // Mark conversation as read when selected
  useEffect(() => {
    if (selectedConversation && selectedConversation.unreadCount > 0) {
      markAsRead({ conversationId: selectedConversation._id });
    }
  }, [selectedConversation, markAsRead]);

  // Handle selecting a conversation
  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
  }, []);

  // Handle sending a message
  const handleSendMessage = useCallback(async (messageBody: string, mediaUrls?: string[]) => {
    if (!selectedConversation || !tenant?._id) return;

    const response = await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: selectedConversation.customerPhoneNumber,
        messageBody,
        mediaUrls,
        organizationId: tenant._id,
        fromNumber: selectedConversation.businessPhoneNumber,
      }),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to send message");
    }
  }, [selectedConversation, tenant?._id]);

  // Handle sending a new conversation
  const handleSendNewConversation = useCallback(async (to: string, messageBody: string) => {
    if (!tenant?._id || !businessPhoneNumber) {
      throw new Error("No phone number configured");
    }

    const response = await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        messageBody,
        organizationId: tenant._id,
        fromNumber: businessPhoneNumber,
      }),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to send message");
    }

    // Select the new conversation after a short delay to let it sync
    setTimeout(() => {
      // Find the conversation by phone number
      const newConv = conversations?.find(
        (c) => c.customerPhoneNumber === to && c.businessPhoneNumber === businessPhoneNumber
      );
      if (newConv) {
        setSelectedConversation(newConv);
      }
    }, 500);
  }, [tenant?._id, businessPhoneNumber, conversations]);

  // Handle archive
  const handleArchive = useCallback(async () => {
    if (!selectedConversation) return;
    await archiveConversation({ conversationId: selectedConversation._id });
    setSelectedConversation(null);
  }, [selectedConversation, archiveConversation]);

  // Handle mark as spam
  const handleMarkSpam = useCallback(async () => {
    if (!selectedConversation) return;
    await markAsSpam({ conversationId: selectedConversation._id });
    setSelectedConversation(null);
  }, [selectedConversation, markAsSpam]);

  // Handle reactivate
  const handleReactivate = useCallback(async () => {
    if (!selectedConversation) return;
    await reactivateConversation({ conversationId: selectedConversation._id });
  }, [selectedConversation, reactivateConversation]);

  // Loading state
  if (!userLoaded || isPlatformUser === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Only platform users can access this page
  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to view tenant dashboards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tenant === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenant === null) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Tenant Not Found</CardTitle>
            <CardDescription>
              The tenant organization you're looking for doesn't exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin">
              <Button className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Impersonation Banner */}
      <Alert className="rounded-none border-x-0 border-t-0 bg-amber-500/10 border-amber-500/20">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-400">
            <strong>Viewing as:</strong> {tenant.name} ({tenant.plan} plan)
          </span>
          <Link href="/admin">
            <Button variant="outline" size="sm" className="border-amber-500/30 hover:bg-amber-500/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </AlertDescription>
      </Alert>

      {/* Navigation Menu */}
      <div className="border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Phone className="h-4 w-4" />
                Calls
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}>
              <Button variant="secondary" size="sm" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Users className="h-4 w-4" />
                Contacts
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                Calendar
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Reports
              </Button>
            </Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* SMS Content */}
      {!businessPhoneNumber ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md">
            <CardHeader className="text-center">
              <CardTitle>No Phone Number</CardTitle>
              <CardDescription>
                This tenant doesn't have a phone number configured. SMS requires an active phone number.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/admin/tenants/${tenant._id}/settings`}>
                <Button className="w-full">
                  <Settings className="h-4 w-4 mr-2" />
                  Configure Phone Number
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Conversation List */}
          <div className="w-80 flex-shrink-0">
            <ConversationList
              conversations={conversations || []}
              selectedConversationId={selectedConversation?._id}
              onSelectConversation={handleSelectConversation}
              onNewConversation={() => setShowNewConversationDialog(true)}
            />
          </div>

          {/* Message Thread */}
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
      )}

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversationDialog}
        onOpenChange={setShowNewConversationDialog}
        onSend={handleSendNewConversation}
        fromNumber={businessPhoneNumber}
      />
    </div>
  );
}
