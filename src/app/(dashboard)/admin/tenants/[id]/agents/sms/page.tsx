"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  BrainCircuit, Plus, Pencil, Trash2, Loader2,
  MessageSquare, ToggleLeft, ToggleRight,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

const AVAILABLE_TOOLS = [
  { id: "book_appointment", label: "Book Appointment", description: "Create appointments for contacts" },
  { id: "transfer_to_human", label: "Transfer to Human", description: "Hand off conversation to a team member" },
  { id: "end_conversation", label: "End Conversation", description: "Mark conversation as complete" },
  { id: "tag_contact", label: "Tag Contact", description: "Add tags to contacts" },
  { id: "create_task", label: "Create Task", description: "Create follow-up tasks" },
];

const MODELS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini (Fast, Cheap)" },
  { id: "gpt-4.1", label: "GPT-4.1 (Most Capable)" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
];

interface AgentForm {
  name: string;
  description: string;
  systemPrompt: string;
  objective: string;
  model: string;
  temperature: number;
  maxTurns: number;
  enabledTools: string[];
  beginMessage: string;
  handoffMessage: string;
  handoffPhoneNumber: string;
  handoffUserId: string;
  completionMessage: string;
}

const defaultForm: AgentForm = {
  name: "",
  description: "",
  systemPrompt: "You are a friendly and professional assistant for an insurance agency. Be helpful, concise, and always try to achieve the objective. Keep responses under 160 characters when possible (SMS-friendly).",
  objective: "",
  model: "gpt-4.1-mini",
  temperature: 0.7,
  maxTurns: 20,
  enabledTools: ["book_appointment", "transfer_to_human", "end_conversation"],
  beginMessage: "",
  handoffMessage: "Let me connect you with a team member who can help further. Someone will be in touch shortly!",
  handoffPhoneNumber: "",
  handoffUserId: "",
  completionMessage: "",
};

export default function SmsAgentsPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const tenant = useQuery(api.organizations.getById, {
    organizationId: tenantId as Id<"organizations">,
  });
  const agents = useQuery(
    api.smsAgents.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const users = useQuery(
    api.users.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const createAgent = useMutation(api.smsAgents.create);
  const updateAgent = useMutation(api.smsAgents.update);
  const removeAgent = useMutation(api.smsAgents.remove);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"smsAgents"> | null>(null);
  const [form, setForm] = useState<AgentForm>(defaultForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (agent: any) => {
    setEditingId(agent._id);
    setForm({
      name: agent.name,
      description: agent.description || "",
      systemPrompt: agent.systemPrompt,
      objective: agent.objective || "",
      model: agent.model,
      temperature: agent.temperature ?? 0.7,
      maxTurns: agent.maxTurns ?? 20,
      enabledTools: agent.enabledTools || [],
      beginMessage: agent.beginMessage || "",
      handoffMessage: agent.handoffMessage || "",
      handoffPhoneNumber: agent.handoffPhoneNumber || "",
      handoffUserId: agent.handoffUserId || "",
      completionMessage: agent.completionMessage || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tenant?._id || !form.name.trim() || !form.systemPrompt.trim()) return;
    setSaving(true);
    try {
      const saveData = {
        ...form,
        enabledTools: form.enabledTools,
        handoffUserId: (form.handoffUserId || undefined) as any,
        handoffPhoneNumber: form.handoffPhoneNumber || undefined,
      };
      if (editingId) {
        await updateAgent({
          agentId: editingId,
          ...saveData,
        });
      } else {
        await createAgent({
          organizationId: tenant._id,
          ...saveData,
        });
      }
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to save SMS agent:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (agentId: Id<"smsAgents">, isActive: boolean) => {
    await updateAgent({ agentId, isActive: !isActive });
  };

  const handleDelete = async (agentId: Id<"smsAgents">) => {
    if (!confirm("Delete this SMS agent? This cannot be undone.")) return;
    await removeAgent({ agentId });
  };

  if (!tenant) {
    return (
      <PageContainer>
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="SMS AI Agents"
        description="Create AI-powered SMS agents that can have conversations with contacts to achieve objectives like booking appointments or qualifying leads."
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New SMS Agent
          </Button>
        }
      />

      {!agents ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BrainCircuit className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No SMS Agents Yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Create your first AI SMS agent to start automated conversations.
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <Card key={agent._id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                    <BrainCircuit className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{agent.name}</h3>
                      <Badge variant={agent.isActive ? "default" : "secondary"}>
                        {agent.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{agent.description}</p>
                    )}
                    {agent.objective && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Objective:</span> {agent.objective}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>Model: {agent.model}</span>
                      <span>Max turns: {agent.maxTurns || 20}</span>
                      <span>Tools: {(agent.enabledTools || []).length}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleToggleActive(agent._id, agent.isActive)}
                    >
                      {agent.isActive ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(agent)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(agent._id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit SMS Agent" : "Create SMS Agent"}</DialogTitle>
            <DialogDescription>
              Configure an AI agent that can have SMS conversations with contacts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Agent Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Appointment Booker"
                  className="h-9 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Objective</Label>
                <Input
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  placeholder="Book an appointment with the contact"
                  className="h-9 text-sm mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description of what this agent does"
                className="h-9 text-sm mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">System Prompt (Agent Instructions)</Label>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder="You are a friendly and professional assistant..."
                className="text-sm mt-1 min-h-[120px]"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                This is the main instruction that controls how the agent behaves. Be specific about tone, objective, and boundaries.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Model</Label>
                <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Temperature</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0.7 })}
                  className="h-9 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Max Turns</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.maxTurns}
                  onChange={(e) => setForm({ ...form, maxTurns: parseInt(e.target.value) || 20 })}
                  className="h-9 text-sm mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-2 block">Enabled Tools</Label>
              <div className="space-y-1.5">
                {AVAILABLE_TOOLS.map((tool) => (
                  <label key={tool.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.enabledTools.includes(tool.id)}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          enabledTools: e.target.checked
                            ? [...form.enabledTools, tool.id]
                            : form.enabledTools.filter((t) => t !== tool.id),
                        });
                      }}
                      className="rounded border-border"
                    />
                    <span className="text-sm">{tool.label}</span>
                    <span className="text-[10px] text-muted-foreground">— {tool.description}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold mb-3">Auto-Messages</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Opening Message (sent when conversation starts)</Label>
                  <Input
                    value={form.beginMessage}
                    onChange={(e) => setForm({ ...form, beginMessage: e.target.value })}
                    placeholder="Hi! I'm here to help you schedule an appointment. What works best for you?"
                    className="h-9 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Handoff Message (sent when transferring to human)</Label>
                  <Input
                    value={form.handoffMessage}
                    onChange={(e) => setForm({ ...form, handoffMessage: e.target.value })}
                    placeholder="Let me connect you with a team member who can help further."
                    className="h-9 text-sm mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Handoff to User</Label>
                    <Select
                      value={form.handoffUserId || "none"}
                      onValueChange={(v) => setForm({ ...form, handoffUserId: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className="h-9 text-sm mt-1">
                        <SelectValue placeholder="Select user..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (assign to any available)</SelectItem>
                        {(users || []).map((u) => (
                          <SelectItem key={u._id} value={u._id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">User who receives handoff conversations</p>
                  </div>
                  <div>
                    <Label className="text-xs">Handoff Phone Number</Label>
                    <Input
                      value={form.handoffPhoneNumber}
                      onChange={(e) => setForm({ ...form, handoffPhoneNumber: e.target.value })}
                      placeholder="+1 (555) 123-4567"
                      className="h-9 text-sm mt-1"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Optional: notify via call/SMS on handoff</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Completion Message (sent when objective achieved)</Label>
                  <Input
                    value={form.completionMessage}
                    onChange={(e) => setForm({ ...form, completionMessage: e.target.value })}
                    placeholder="Great, you're all set! We'll see you then."
                    className="h-9 text-sm mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.systemPrompt.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingId ? "Update Agent" : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
