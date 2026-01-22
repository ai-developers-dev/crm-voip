"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  onSend: (message: string, mediaUrls?: string[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageComposer({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
}: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Character counter
  const charCount = message.length;
  const segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);
  const maxChars = 1600; // Twilio max for concatenated SMS
  const isOverLimit = charCount > maxChars;

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  // Handle send
  const handleSend = useCallback(async () => {
    if (!message.trim() && attachments.length === 0) return;
    if (isSending || isOverLimit) return;

    setIsSending(true);
    try {
      await onSend(message.trim(), attachments.length > 0 ? attachments : undefined);
      setMessage("");
      setAttachments([]);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  }, [message, attachments, isSending, isOverLimit, onSend]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t p-4">
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {attachments.map((url, index) => (
            <div
              key={index}
              className="relative group bg-muted rounded-lg p-2 flex items-center gap-2"
            >
              <span className="text-sm truncate max-w-[150px]">
                Attachment {index + 1}
              </span>
              <button
                onClick={() => removeAttachment(index)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="flex items-end gap-2">
        {/* Attachment Button (disabled for now - would need file upload) */}
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || isSending}
          className="shrink-0"
          title="Attach media (coming soon)"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {/* Text Input */}
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSending}
            className={cn(
              "min-h-[40px] max-h-[120px] resize-none pr-16",
              isOverLimit && "border-destructive focus-visible:ring-destructive"
            )}
            rows={1}
          />

          {/* Character Counter */}
          <div
            className={cn(
              "absolute right-3 bottom-2 text-xs",
              isOverLimit ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {charCount > 0 && (
              <>
                {charCount}/{maxChars}
                {segmentCount > 1 && ` (${segmentCount} SMS)`}
              </>
            )}
          </div>
        </div>

        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={disabled || isSending || (!message.trim() && attachments.length === 0) || isOverLimit}
          size="icon"
          className="shrink-0"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}

// Disabled state composer (when no conversation selected)
export function MessageComposerDisabled() {
  return (
    <div className="border-t p-4">
      <div className="flex items-end gap-2 opacity-50">
        <Button variant="ghost" size="icon" disabled className="shrink-0">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          placeholder="Select a conversation to send a message"
          disabled
          className="min-h-[40px] resize-none"
          rows={1}
        />
        <Button size="icon" disabled className="shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
