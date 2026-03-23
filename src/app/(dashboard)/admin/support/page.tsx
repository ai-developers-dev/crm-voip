"use client";

import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Send, MessageCircle, CheckCircle, Clock,
  AlertCircle, Circle, Building2, Settings, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function AutoReplySettingsToggle() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const settings = useQuery(api.support.getAutoReplySettings);
  const saveSettings = useMutation(api.support.saveAutoReplySettings);

  const [autoReply, setAutoReply] = useState("");
  const [noAgentMsg, setNoAgentMsg] = useState("");
  const [delaySec, setDelaySec] = useState(300);

  // Hydrate from DB
  useEffect(() => {
    if (settings) {
      setAutoReply(settings.autoReply);
      setNoAgentMsg(settings.noAgentMessage);
      setDelaySec(settings.delaySec);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveSettings({ autoReply, noAgentMessage: noAgentMsg, delaySec });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} className="gap-1.5">
        <Settings className="h-3.5 w-3.5" />
        Auto-Reply
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <div className="absolute right-6 top-20 z-50 w-96 rounded-lg border bg-card p-4 shadow-lg space-y-3">
          <h3 className="text-sm font-semibold">Auto-Reply Settings</h3>

          <div>
            <Label className="text-xs">Instant Auto-Reply</Label>
            <Textarea
              value={autoReply}
              onChange={(e) => setAutoReply(e.target.value)}
              placeholder="Thanks for reaching out! A support agent will be with you shortly."
              className="text-sm mt-1 min-h-[60px]"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">Sent immediately when a tenant opens a new ticket.</p>
          </div>

          <div>
            <Label className="text-xs">No-Agent Available Message</Label>
            <Textarea
              value={noAgentMsg}
              onChange={(e) => setNoAgentMsg(e.target.value)}
              placeholder="No agent is available right now, but we've created a ticket and will follow up ASAP."
              className="text-sm mt-1 min-h-[60px]"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">Sent if no one responds within the delay. Ticket moves to "In Progress".</p>
          </div>

          <div>
            <Label className="text-xs">Response Delay (seconds)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={30}
                max={3600}
                value={delaySec}
                onChange={(e) => setDelaySec(Number(e.target.value))}
                className="h-9 text-sm w-24"
              />
              <span className="text-xs text-muted-foreground">
                = {delaySec >= 60 ? `${Math.floor(delaySec / 60)}m ${delaySec % 60}s` : `${delaySec}s`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save
            </Button>
            {saved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Saved!</span>}
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSupportPage() {
  const { user } = useUser();
  const [filter, setFilter] = useState("open");
  const [selectedTicketId, setSelectedTicketId] = useState<Id<"supportTickets"> | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tickets = useQuery(api.support.getAllTickets, { status: filter });
  const messages = useQuery(
    api.support.getMessages,
    selectedTicketId ? { ticketId: selectedTicketId } : "skip"
  );

  const sendMsg = useMutation(api.support.sendMessage);
  const markRead = useMutation(api.support.markAsRead);
  const updateStatus = useMutation(api.support.updateStatus);

  const selectedTicket = tickets?.find((t) => t._id === selectedTicketId);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Mark as read when selecting
  useEffect(() => {
    if (selectedTicketId && selectedTicket?.unreadByAdmin && selectedTicket.unreadByAdmin > 0) {
      markRead({ ticketId: selectedTicketId, readerType: "admin" });
    }
  }, [selectedTicketId, selectedTicket?.unreadByAdmin, markRead]);

  const handleSendReply = async () => {
    if (!reply.trim() || !selectedTicketId || sending) return;
    setSending(true);
    try {
      await sendMsg({
        ticketId: selectedTicketId,
        body: reply.trim(),
        senderType: "admin",
        senderName: user?.fullName || "Support",
        senderUserId: user?.id,
      });
      setReply("");
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Support Tickets" description="Manage tenant support requests"
        action={<AutoReplySettingsToggle />}
      />

      <div className="flex gap-4" style={{ height: "calc(100vh - var(--header-height) - 120px)" }}>
        {/* Left: Ticket List */}
        <div className="w-80 shrink-0 flex flex-col border rounded-lg">
          <div className="p-2 border-b shrink-0">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList className="w-full">
                <TabsTrigger value="open" className="flex-1 text-xs">Open</TabsTrigger>
                <TabsTrigger value="in_progress" className="flex-1 text-xs">In Progress</TabsTrigger>
                <TabsTrigger value="resolved" className="flex-1 text-xs">Resolved</TabsTrigger>
                <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!tickets ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No tickets</p>
              </div>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket._id}
                  onClick={() => setSelectedTicketId(ticket._id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b transition-colors",
                    selectedTicketId === ticket._id ? "bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-semibold truncate">{ticket.orgName}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(ticket.lastMessageAt)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{ticket.userName}</p>
                  <p className="text-xs truncate mt-0.5">{ticket.lastMessagePreview}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {ticket.status === "open" && <Badge variant="secondary" className="text-[9px] px-1 py-0">Open</Badge>}
                    {ticket.status === "in_progress" && <Badge className="text-[9px] px-1 py-0 bg-blue-500/15 text-blue-600 border-blue-500/30">In Progress</Badge>}
                    {ticket.status === "resolved" && <Badge variant="default" className="text-[9px] px-1 py-0">Resolved</Badge>}
                    {ticket.unreadByAdmin > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                        {ticket.unreadByAdmin}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Thread */}
        <div className="flex-1 flex flex-col border rounded-lg">
          {!selectedTicket ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <MessageCircle className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Select a ticket to view</p>
              </div>
            </div>
          ) : (
            <>
              {/* Ticket header */}
              <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{selectedTicket.orgName}</p>
                  <p className="text-xs text-muted-foreground">{selectedTicket.userName} · {new Date(selectedTicket.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTicket.status !== "in_progress" && selectedTicket.status !== "resolved" && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => updateStatus({ ticketId: selectedTicket._id, status: "in_progress" })}>
                      <Clock className="h-3 w-3 mr-1" /> In Progress
                    </Button>
                  )}
                  {selectedTicket.status !== "resolved" && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => updateStatus({ ticketId: selectedTicket._id, status: "resolved" })}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages?.map((msg) => (
                  <div
                    key={msg._id}
                    className={cn(
                      "flex",
                      msg.senderType === "admin" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3.5 py-2",
                        msg.senderType === "admin"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      )}
                    >
                      <p className="text-[10px] font-semibold mb-0.5 opacity-70">{msg.senderName}</p>
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                      <p className={cn(
                        "text-[10px] mt-1",
                        msg.senderType === "admin" ? "text-primary-foreground/60" : "text-muted-foreground"
                      )}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply composer */}
              <div className="border-t px-4 py-3 shrink-0">
                <div className="flex gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your reply..."
                    className="min-h-[40px] max-h-[120px] text-sm resize-none"
                    rows={1}
                  />
                  <Button
                    size="sm"
                    onClick={handleSendReply}
                    disabled={!reply.trim() || sending}
                    className="h-10 w-10 p-0 shrink-0"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
