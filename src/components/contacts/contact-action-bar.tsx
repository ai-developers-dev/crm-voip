"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Phone, DollarSign, MailCheck, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOptionalCallingContext } from "@/components/calling/calling-provider";
import { SaleFormDialog } from "./sale-form-dialog";

interface ContactActionBarProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
}

export function ContactActionBar({ contact, organizationId }: ContactActionBarProps) {
  const callingContext = useOptionalCallingContext();
  const toggleRead = useMutation(api.contacts.toggleRead);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);

  const primaryPhone = contact.phoneNumbers?.find((p) => p.isPrimary)?.number
    || contact.phoneNumbers?.[0]?.number;

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

          {/* New Sale */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setSaleDialogOpen(true)}
              >
                <DollarSign className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>New Sale</p>
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

      {/* Sale Dialog */}
      <SaleFormDialog
        open={saleDialogOpen}
        onOpenChange={setSaleDialogOpen}
        contact={contact}
        organizationId={organizationId}
      />
    </>
  );
}
