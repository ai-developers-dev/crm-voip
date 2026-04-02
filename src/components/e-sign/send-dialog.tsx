"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, FileText, User, Loader2 } from "lucide-react";

interface SendDialogRequest {
  _id: string;
  fileName: string;
  contactName: string;
  contactEmail?: string;
  fields: { id: string; type: string }[];
  subject?: string;
  message?: string;
}

interface SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: SendDialogRequest;
  onSend: (requestId: string, expiresInDays?: number) => Promise<void>;
}

export function SendDialog({ open, onOpenChange, request, onSend }: SendDialogProps) {
  const [subject, setSubject] = useState(
    request.subject || `Please sign: ${request.fileName}`
  );
  const [message, setMessage] = useState(
    request.message || "Please review and sign the attached document at your earliest convenience."
  );
  const [expiresIn, setExpiresIn] = useState<string>("30");
  const [isSending, setIsSending] = useState(false);

  // Count field types
  const fieldCounts = request.fields.reduce(
    (acc, field) => {
      acc[field.type] = (acc[field.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const handleSend = async () => {
    setIsSending(true);
    try {
      const days = expiresIn === "none" ? undefined : parseInt(expiresIn, 10);
      await onSend(request._id, days);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold tracking-tight">
            Send for Signature
          </DialogTitle>
          <DialogDescription>
            Review the details below and send this document for signing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Document Info */}
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <FileText className="h-5 w-5 text-on-surface-variant mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{request.fileName}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {request.fields.length} field{request.fields.length !== 1 ? "s" : ""}
                {Object.entries(fieldCounts).length > 0 && (
                  <span>
                    {" "}
                    ({Object.entries(fieldCounts)
                      .map(([type, count]) => `${count} ${type}`)
                      .join(", ")})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Contact Info */}
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <User className="h-5 w-5 text-on-surface-variant mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{request.contactName}</p>
              {request.contactEmail && (
                <p className="text-xs text-on-surface-variant">{request.contactEmail}</p>
              )}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line"
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional message to the signer"
              rows={3}
            />
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <Label htmlFor="expires">Expires In</Label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger id="expires">
                <SelectValue placeholder="Select expiration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="none">No expiration</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send for Signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
