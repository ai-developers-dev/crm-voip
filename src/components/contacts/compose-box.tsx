"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  MessageCircle,
  ChevronDown,
  Smile,
  Paperclip,
  Send,
  Minus,
  Maximize2,
  Mail,
  Check,
  X,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

type ChannelType = "sms" | "email";

interface ComposeBoxProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
}

const channelOptions: { type: ChannelType; label: string; icon: React.ComponentType<{ className?: string }>; enabled: boolean }[] = [
  { type: "sms", label: "SMS", icon: MessageCircle, enabled: true },
  { type: "email", label: "Email", icon: Mail, enabled: true },
];

export function ComposeBox({ contact, organizationId }: ComposeBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [channel, setChannel] = useState<ChannelType>("sms");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  // Email-specific fields
  const [emailSubject, setEmailSubject] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orgPhones = useQuery(api.phoneNumbers.getByOrganization, { organizationId });
  const emailAccounts = useQuery(api.emailAccounts.getByOrganization, { organizationId });

  const primaryPhone = contact.phoneNumbers?.find((p) => p.isPrimary)?.number
    || contact.phoneNumbers?.[0]?.number;
  const fromNumber = orgPhones?.[0]?.phoneNumber;
  const activeEmailAccount = emailAccounts?.find((a) => a.status === "active");
  const contactEmail = contact.email || "";

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [message, adjustHeight]);

  // Focus textarea when expanding
  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isExpanded]);

  const canSend = () => {
    if (!message.trim() || isSending) return false;
    if (channel === "sms") return !!primaryPhone && !!fromNumber && !contact.smsOptedOut;
    if (channel === "email") {
      const toAddr = emailTo || contactEmail;
      return !!toAddr && !!emailSubject.trim() && !!activeEmailAccount;
    }
    return false;
  };

  const handleSend = async () => {
    if (!canSend()) return;

    setIsSending(true);
    try {
      if (channel === "sms") {
        const mediaUrls: string[] = [];
        await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: primaryPhone,
            messageBody: message.trim(),
            organizationId,
            fromNumber,
            contactId: contact._id,
            mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          }),
        });
      } else if (channel === "email") {
        const toAddr = emailTo || contactEmail;
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            emailAccountId: activeEmailAccount!._id,
            nylasGrantId: activeEmailAccount!.nylasGrantId,
            to: toAddr,
            cc: emailCc || undefined,
            subject: emailSubject.trim(),
            bodyPlain: message.trim(),
            bodyHtml: `<p>${message.trim().replace(/\n/g, "<br>")}</p>`,
            contactId: contact._id,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to send email");
        }
      }
      setMessage("");
      setAttachments([]);
      if (channel === "email") {
        setEmailSubject("");
        setEmailTo("");
        setEmailCc("");
      }
    } catch (err) {
      console.error(`Failed to send ${channel}:`, err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newMsg = message.slice(0, start) + emoji.native + message.slice(end);
      setMessage(newMsg);
      // Restore cursor position after emoji
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + emoji.native.length;
        el.focus();
      });
    } else {
      setMessage(message + emoji.native);
    }
    setEmojiOpen(false);
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const currentChannel = channelOptions.find((c) => c.type === channel)!;
  const ChannelIcon = currentChannel.icon;

  // Collapsed state
  if (!isExpanded) {
    return (
      <div className="border-t bg-background px-3 py-2">
        <div
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 cursor-text hover:border-primary/30 transition-colors"
        >
          {/* Channel selector */}
          <Popover open={channelMenuOpen} onOpenChange={setChannelMenuOpen}>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); setChannelMenuOpen(true); }}
                className="flex items-center gap-0.5 text-primary hover:text-primary/80 transition-colors shrink-0"
              >
                <ChannelIcon className="h-5 w-5" />
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-1" side="top">
              {channelOptions.map((opt) => (
                <button
                  key={opt.type}
                  disabled={!opt.enabled}
                  onClick={() => { setChannel(opt.type); setChannelMenuOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    opt.enabled ? "hover:bg-muted" : "opacity-40 cursor-not-allowed",
                    channel === opt.type && "bg-muted"
                  )}
                >
                  <opt.icon className="h-5 w-5 text-primary" />
                  <span className="flex-1 text-left">{opt.label}</span>
                  {channel === opt.type && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <span className="text-sm text-muted-foreground flex-1">Type a message...</span>

          {/* Send button */}
          <Button
            size="sm"
            className="h-8 w-8 p-0 bg-primary/20 hover:bg-primary/30 text-primary shrink-0"
            disabled
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Expanded state
  return (
    <div className="border-t bg-background">
      {/* SMS opt-out warning */}
      {contact.smsOptedOut && channel === "sms" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          <span>This contact has opted out of SMS. They must reply START to re-subscribe.</span>
        </div>
      )}

      {/* From / To header */}
      <div className="border-b px-4 py-2 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {channel === "sms" ? (
              <>
                <span className="text-muted-foreground">
                  <strong>From:</strong>{" "}
                  <span className="text-foreground">{fromNumber || "No number"}</span>
                </span>
                <span className="text-muted-foreground">
                  <strong>To:</strong>{" "}
                  <span className="text-foreground">{primaryPhone || "No number"}</span>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                <strong>From:</strong>{" "}
                <span className="text-foreground">{activeEmailAccount?.email || "No email connected"}</span>
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => setIsExpanded(false)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {/* Email-specific fields */}
        {channel === "email" && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-8 text-right text-xs">To:</span>
              <input
                type="email"
                value={emailTo || contactEmail}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-8 text-right text-xs">Cc:</span>
              <input
                type="text"
                value={emailCc}
                onChange={(e) => setEmailCc(e.target.value)}
                placeholder="cc@example.com"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-8 text-right text-xs">Subj:</span>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject"
                className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        )}
      </div>

      {/* Message textarea */}
      <div className="px-4 py-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={3}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          style={{ minHeight: "72px", maxHeight: "160px" }}
        />
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {attachments.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
            >
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between border-t px-3 py-2">
        <div className="flex items-center gap-0.5">
          {/* Channel selector */}
          <Popover open={channelMenuOpen} onOpenChange={setChannelMenuOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-0.5 rounded-md px-2 py-1.5 text-primary hover:bg-muted transition-colors">
                <ChannelIcon className="h-5 w-5" />
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-1" side="top">
              {channelOptions.map((opt) => (
                <button
                  key={opt.type}
                  disabled={!opt.enabled}
                  onClick={() => { setChannel(opt.type); setChannelMenuOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    opt.enabled ? "hover:bg-muted" : "opacity-40 cursor-not-allowed",
                    channel === opt.type && "bg-muted"
                  )}
                >
                  <opt.icon className="h-5 w-5 text-primary" />
                  <span className="flex-1 text-left">{opt.label}</span>
                  {channel === opt.type && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <div className="h-5 w-px bg-border mx-1" />

          {/* Emoji picker */}
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Smile className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0 border-0" side="top">
              <Picker
                data={data}
                onEmojiSelect={handleEmojiSelect}
                theme="light"
                previewPosition="none"
                skinTonePosition="none"
                maxFrequentRows={2}
              />
            </PopoverContent>
          </Popover>

          {/* Attachment */}
          <button
            onClick={handleAttachClick}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Send button */}
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!canSend()}
          className="h-8 gap-1 bg-primary/80 hover:bg-primary text-white"
        >
          <Send className="h-4 w-4" />
          {isSending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
