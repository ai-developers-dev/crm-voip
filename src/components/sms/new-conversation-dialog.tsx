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
import { Loader2 } from "lucide-react";
import { formatToE164, isValidPhoneNumber } from "@/lib/utils/phone";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (to: string, message: string) => Promise<void>;
  fromNumber: string;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onSend,
  fromNumber,
}: NewConversationDialogProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Character counter
  const charCount = message.length;
  const maxChars = 1600;
  const isOverLimit = charCount > maxChars;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate phone number
    if (!phoneNumber.trim()) {
      setError("Please enter a phone number");
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setError("Please enter a valid phone number");
      return;
    }

    if (!message.trim()) {
      setError("Please enter a message");
      return;
    }

    if (isOverLimit) {
      setError("Message is too long");
      return;
    }

    setIsSending(true);
    try {
      const formattedNumber = formatToE164(phoneNumber);
      await onSend(formattedNumber, message.trim());

      // Reset and close
      setPhoneNumber("");
      setMessage("");
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (!isSending) {
      setPhoneNumber("");
      setMessage("");
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
          <DialogDescription>
            Start a new SMS conversation. Enter the recipient's phone number and your message.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* From Number (read-only) */}
            <div className="grid gap-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" value={fromNumber} disabled />
            </div>

            {/* To Number */}
            <div className="grid gap-2">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="tel"
                placeholder="(555) 123-4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isSending}
              />
            </div>

            {/* Message */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">Message</Label>
                <span className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
                  {charCount}/{maxChars}
                </span>
              </div>
              <Textarea
                id="message"
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={isSending}
                className="min-h-[100px]"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSending || !message.trim() || !phoneNumber.trim()}>
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Message"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
