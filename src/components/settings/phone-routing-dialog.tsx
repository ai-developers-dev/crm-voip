"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone, Users, Loader2, CheckCircle,
} from "lucide-react";

interface PhoneRoutingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: any; // phoneNumbers record
  organizationId: Id<"organizations">;
}

export function PhoneRoutingDialog({ open, onOpenChange, phoneNumber, organizationId }: PhoneRoutingDialogProps) {
  const users = useQuery(api.users.getByOrganization, { organizationId });
  const retellAgents = useQuery(api.retellAgents.getByOrganization, { organizationId });
  const updateRouting = useMutation(api.phoneNumbers.updateRouting);

  const [friendlyName, setFriendlyName] = useState("");
  const [type, setType] = useState<string>("main");
  const [routingType, setRoutingType] = useState<string>("ring_all");
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [ringGroupUserIds, setRingGroupUserIds] = useState<string[]>([]);
  const [voicemailEnabled, setVoicemailEnabled] = useState(true);
  // Unanswered fallback
  const [unansweredAction, setUnansweredAction] = useState<string>("voicemail");
  const [unansweredTimeout, setUnansweredTimeout] = useState(30);
  const [unansweredAiAgentId, setUnansweredAiAgentId] = useState<string>("");
  const [voicemailGreeting, setVoicemailGreeting] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (phoneNumber) {
      setFriendlyName(phoneNumber.friendlyName || "");
      setType(phoneNumber.type || "main");
      setRoutingType(phoneNumber.routingType || "ring_all");
      setAssignedUserId(phoneNumber.assignedUserId || "");
      setRingGroupUserIds(phoneNumber.ringGroupUserIds || []);
      setVoicemailEnabled(phoneNumber.voicemailEnabled ?? true);
      setUnansweredAction(phoneNumber.unansweredAction || "voicemail");
      setUnansweredTimeout(phoneNumber.unansweredTimeoutSeconds || 30);
      setUnansweredAiAgentId(phoneNumber.unansweredAiAgentId || "");
      setVoicemailGreeting(phoneNumber.voicemailGreeting || "");
    }
  }, [phoneNumber]);

  const handleSave = async () => {
    if (!phoneNumber) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateRouting({
        phoneNumberId: phoneNumber._id,
        type: type as any,
        routingType: routingType as any,
        assignedUserId: routingType === "direct" && assignedUserId ? assignedUserId as any : undefined,
        ringGroupUserIds: routingType === "ring_group" ? ringGroupUserIds as any : undefined,
        voicemailEnabled,
        friendlyName: friendlyName || undefined,
        unansweredAction: unansweredAction as any,
        unansweredTimeoutSeconds: unansweredTimeout,
        unansweredAiAgentId: unansweredAction === "ai_agent" && unansweredAiAgentId ? unansweredAiAgentId as any : undefined,
        voicemailGreeting: unansweredAction === "voicemail" && voicemailGreeting ? voicemailGreeting : undefined,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); onOpenChange(false); }, 1500);
    } catch (err) {
      console.error("Failed to update routing:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleRingGroupUser = (userId: string) => {
    setRingGroupUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  if (!phoneNumber) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Configure {phoneNumber.phoneNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Friendly name */}
          <div>
            <Label className="text-xs">Display Name</Label>
            <Input
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="Main Line, Doug's Direct, Sales..."
              className="h-9 text-sm mt-1"
            />
          </div>

          {/* Type */}
          <div>
            <Label className="text-xs">Number Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">Main Line</SelectItem>
                <SelectItem value="direct">Direct Line</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="tracking">Tracking</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Routing */}
          <div>
            <Label className="text-xs">Call Routing</Label>
            <Select value={routingType} onValueChange={setRoutingType}>
              <SelectTrigger className="h-9 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ring_all">Ring All Agents</SelectItem>
                <SelectItem value="direct">Direct to One User</SelectItem>
                <SelectItem value="ring_group">Ring Group (Select Users)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-on-surface-variant mt-1">
              {routingType === "ring_all" && "All available agents will ring simultaneously."}
              {routingType === "direct" && "Only the assigned user will ring when this number is called."}
              {routingType === "ring_group" && "Only selected users will ring when this number is called."}
            </p>
          </div>

          {/* Direct: Assigned User */}
          {routingType === "direct" && (
            <div>
              <Label className="text-xs">Assigned User</Label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  {(users || []).map((u) => (
                    <SelectItem key={u._id} value={u._id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Ring Group: Multi-select users */}
          {routingType === "ring_group" && (
            <div>
              <Label className="text-xs">Ring Group Members</Label>
              <div className="mt-1 space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                {(users || []).map((u) => (
                  <label key={u._id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-surface-container-high/50 cursor-pointer">
                    <Checkbox
                      checked={ringGroupUserIds.includes(u._id)}
                      onCheckedChange={() => toggleRingGroupUser(u._id)}
                    />
                    <span className="text-sm">{u.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto">{u.role}</Badge>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-on-surface-variant mt-1">{ringGroupUserIds.length} user{ringGroupUserIds.length !== 1 ? "s" : ""} selected</p>
            </div>
          )}

          {/* Ring Duration */}
          <div>
            <Label className="text-xs">Ring Duration</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={5}
                max={120}
                value={unansweredTimeout}
                onChange={(e) => setUnansweredTimeout(Number(e.target.value))}
                className="h-9 text-sm w-20"
              />
              <span className="text-xs text-on-surface-variant">
                seconds (≈ {Math.round(unansweredTimeout / 5)} rings)
              </span>
            </div>
          </div>

          {/* When Unanswered */}
          <div>
            <Label className="text-xs">When No One Answers</Label>
            <Select value={unansweredAction} onValueChange={setUnansweredAction}>
              <SelectTrigger className="h-9 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="voicemail">Go to Voicemail</SelectItem>
                <SelectItem value="parking">Send to Parking Lot</SelectItem>
                <SelectItem value="ai_agent">AI Agent Answers</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-on-surface-variant mt-1">
              {unansweredAction === "voicemail" && "Caller can leave a voice message."}
              {unansweredAction === "parking" && "Caller hears hold music. Agents see the parked call and can pick it up."}
              {unansweredAction === "ai_agent" && "AI agent picks up and handles the conversation."}
            </p>
          </div>

          {/* Voicemail Greeting */}
          {unansweredAction === "voicemail" && (
            <div>
              <Label className="text-xs">Custom Voicemail Greeting</Label>
              <Input
                value={voicemailGreeting}
                onChange={(e) => setVoicemailGreeting(e.target.value)}
                placeholder="Sorry, no one is available. Please leave a message."
                className="h-9 text-sm mt-1"
              />
            </div>
          )}

          {/* AI Agent Selection */}
          {unansweredAction === "ai_agent" && (
            <div>
              <Label className="text-xs">AI Agent</Label>
              <Select value={unansweredAiAgentId} onValueChange={setUnansweredAiAgentId}>
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue placeholder="Select AI agent..." />
                </SelectTrigger>
                <SelectContent>
                  {(retellAgents || []).filter((a: any) => a.isActive).map((agent: any) => (
                    <SelectItem key={agent._id} value={agent._id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Saved!</span>}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Routing
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
