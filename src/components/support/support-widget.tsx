"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  MessageCircle, Send, Loader2, CheckCircle, X, ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SupportWidgetProps {
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  userName: string;
  orgName: string;
}

export function SupportWidget({ organizationId, userId, userName, orgName }: SupportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const unreadCount = useQuery(api.support.getTenantUnreadCount, { organizationId });
  const openTicket = useQuery(api.support.getOpenTicketForTenant, { organizationId });
  const messages = useQuery(
    api.support.getMessages,
    openTicket?._id ? { ticketId: openTicket._id } : "skip"
  );

  const createTicket = useMutation(api.support.createTicket);
  const sendMsg = useMutation(api.support.sendMessage);
  const markRead = useMutation(api.support.markAsRead);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark as read when opening with an existing ticket
  useEffect(() => {
    if (open && openTicket?._id && openTicket.unreadByTenant > 0) {
      markRead({ ticketId: openTicket._id, readerType: "tenant" });
    }
  }, [open, openTicket?._id, openTicket?.unreadByTenant, markRead]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      if (openTicket) {
        await sendMsg({
          ticketId: openTicket._id,
          body: message.trim(),
          senderType: "tenant",
          senderName: userName,
        });
      } else {
        await createTicket({
          organizationId,
          userId,
          userName,
          orgName,
          message: message.trim(),
        });
      }
      setMessage("");
    } catch (err) {
      console.error("Failed to send support message:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="fixed bottom-6 right-20 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors">
          <MessageCircle className="h-5 w-5" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] flex flex-col p-0">
        {/* Header */}
        <div className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-sm font-semibold">Support</SheetTitle>
          <p className="text-xs text-muted-foreground">
            {openTicket
              ? openTicket.status === "resolved"
                ? "Your ticket has been resolved"
                : "We'll respond as soon as possible"
              : "How can we help you today?"}
          </p>
          {openTicket && (
            <Badge
              variant={openTicket.status === "resolved" ? "default" : "secondary"}
              className="mt-1 text-[10px]"
            >
              {openTicket.status === "open" && "Open"}
              {openTicket.status === "in_progress" && "In Progress"}
              {openTicket.status === "resolved" && "Resolved"}
            </Badge>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {!openTicket && !messages && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">Need help?</p>
              <p className="text-xs text-muted-foreground mt-1">
                Send us a message and we'll get back to you shortly.
              </p>
            </div>
          )}

          {messages?.map((msg) => (
            <div
              key={msg._id}
              className={cn(
                "flex",
                msg.senderType === "tenant" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2",
                  msg.senderType === "tenant"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                )}
              >
                {msg.senderType === "admin" && (
                  <p className="text-[10px] font-semibold mb-0.5 opacity-70">{msg.senderName}</p>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                <p className={cn(
                  "text-[10px] mt-1",
                  msg.senderType === "tenant" ? "text-primary-foreground/60" : "text-muted-foreground"
                )}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="border-t px-4 py-3 shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="min-h-[40px] max-h-[120px] text-sm resize-none"
              rows={1}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className="h-10 w-10 p-0 shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
