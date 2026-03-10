"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Phone, MessageSquare, MailCheck, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useOptionalCallingContext } from "@/components/calling/calling-provider";

interface ContactActionBarProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
}

export function ContactActionBar({ contact, organizationId }: ContactActionBarProps) {
  const callingContext = useOptionalCallingContext();
  const toggleRead = useMutation(api.contacts.toggleRead);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [smsBody, setSmsBody] = useState("");
  const [smsSending, setSmsSending] = useState(false);

  // Get org phone numbers for SMS "from" number
  const orgPhones = useQuery(api.phoneNumbers.getByOrganization, { organizationId });

  const primaryPhone = contact.phoneNumbers?.find((p) => p.isPrimary)?.number
    || contact.phoneNumbers?.[0]?.number;

  const fromNumber = orgPhones?.[0]?.phoneNumber;

  const handleCall = async () => {
    if (!primaryPhone || !callingContext) {
      console.warn("Cannot call:", { primaryPhone, hasContext: !!callingContext, isReady: callingContext?.isReady });
      return;
    }
    try {
      await callingContext.makeCall(primaryPhone);
    } catch (err) {
      console.error("Failed to make call:", err);
    }
  };

  const handleSendSms = async () => {
    if (!smsBody.trim() || !primaryPhone || !fromNumber) return;
    setSmsSending(true);
    try {
      await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: primaryPhone,
          messageBody: smsBody.trim(),
          organizationId,
          fromNumber,
          contactId: contact._id,
        }),
      });
      setSmsBody("");
      setSmsDialogOpen(false);
    } catch (err) {
      console.error("Failed to send SMS:", err);
    } finally {
      setSmsSending(false);
    }
  };

  const handleToggleRead = () => {
    toggleRead({ contactId: contact._id });
  };

  const isRead = contact.isRead !== false; // default to read if undefined

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-1">
          {/* Call */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleCall}
                disabled={!primaryPhone || !callingContext}
              >
                <Phone className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Call {primaryPhone || "No phone"}</p>
            </TooltipContent>
          </Tooltip>

          {/* SMS */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setSmsDialogOpen(true)}
                disabled={!primaryPhone}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Send SMS</p>
            </TooltipContent>
          </Tooltip>

          {/* Mark as Read / Unread */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleToggleRead}
              >
                {isRead ? (
                  <MailOpen className="h-4 w-4" />
                ) : (
                  <MailCheck className="h-4 w-4 text-primary" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isRead ? "Mark as unread" : "Mark as read"}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* SMS Compose Dialog */}
      <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send SMS to {contact.firstName} {contact.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              To: {primaryPhone}
            </div>
            <div className="space-y-2">
              <Label htmlFor="smsBody">Message</Label>
              <Textarea
                id="smsBody"
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                rows={4}
                placeholder="Type your message..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSmsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendSms}
                disabled={!smsBody.trim() || smsSending || !fromNumber}
              >
                {smsSending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
