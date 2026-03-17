"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Phone, Bot, Settings, ArrowLeft, Trash2,
  MessageSquare, Users, Calendar, BarChart3, Workflow,
  PhoneOutgoing, PhoneIncoming, Mic, Volume2, Brain, X,
} from "lucide-react";
import Link from "next/link";

const VOICE_MODELS = [
  { value: "eleven_flash_v2", label: "ElevenLabs Flash v2" },
  { value: "eleven_turbo_v2", label: "ElevenLabs Turbo v2" },
  { value: "sonic-3", label: "Cartesia Sonic 3" },
  { value: "gpt-4o-mini-tts", label: "OpenAI TTS" },
];

const LLM_MODELS = [
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { value: "claude-4.5-sonnet", label: "Claude 4.5 Sonnet" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

const LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "zh-CN", label: "Chinese (Mandarin)" },
];

const AMBIENT_SOUNDS = [
  { value: "", label: "None" },
  { value: "call-center", label: "Call Center" },
  { value: "coffee-shop", label: "Coffee Shop" },
  { value: "convention-hall", label: "Convention Hall" },
  { value: "summer-outdoor", label: "Summer Outdoor" },
];

export default function TenantAICallingPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  const agents = useQuery(
    api.retellAgents.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Check platform org for Retell configuration
  const platformOrg = useQuery(api.organizations.getPlatformOrg);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"inbound" | "outbound" | "both">("outbound");
  const [description, setDescription] = useState("");
  const [voiceId, setVoiceId] = useState("11labs-Adrian");
  const [voiceModel, setVoiceModel] = useState("eleven_flash_v2");
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [language, setLanguage] = useState("en-US");
  const [generalPrompt, setGeneralPrompt] = useState("");
  const [beginMessage, setBeginMessage] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [modelTemperature, setModelTemperature] = useState(0.7);
  const [responsiveness, setResponsiveness] = useState(1);
  const [interruptionSensitivity, setInterruptionSensitivity] = useState(1);
  const [enableBackchannel, setEnableBackchannel] = useState(true);
  const [ambientSound, setAmbientSound] = useState("");
  const [maxCallDurationMs, setMaxCallDurationMs] = useState(3600000);
  const [enableVoicemailDetection, setEnableVoicemailDetection] = useState(false);
  const [voicemailMessage, setVoicemailMessage] = useState("");
  const [enableTransferToHuman, setEnableTransferToHuman] = useState(false);
  const [transferPhoneNumber, setTransferPhoneNumber] = useState("");
  const [analysisSummaryPrompt, setAnalysisSummaryPrompt] = useState("");
  const [analysisSuccessPrompt, setAnalysisSuccessPrompt] = useState("");

  const hasRetell = !!(platformOrg?.settings as any)?.retellConfigured;

  const resetForm = () => {
    setName(""); setType("outbound"); setDescription("");
    setVoiceId("11labs-Adrian"); setVoiceModel("eleven_flash_v2");
    setVoiceSpeed(1); setLanguage("en-US");
    setGeneralPrompt(""); setBeginMessage("");
    setModel("gpt-4.1-mini"); setModelTemperature(0.7);
    setResponsiveness(1); setInterruptionSensitivity(1);
    setEnableBackchannel(true); setAmbientSound("");
    setMaxCallDurationMs(3600000); setEnableVoicemailDetection(false);
    setVoicemailMessage(""); setEnableTransferToHuman(false);
    setTransferPhoneNumber(""); setAnalysisSummaryPrompt("");
    setAnalysisSuccessPrompt(""); setEditingId(null);
  };

  const handleSave = async () => {
    if (!tenant?._id || !name || !generalPrompt) return;
    setSaving(true);
    try {
      const body = {
        organizationId: tenant._id,
        name, type, description, voiceId, voiceModel, voiceSpeed,
        language, generalPrompt, beginMessage, model, modelTemperature,
        responsiveness, interruptionSensitivity, enableBackchannel,
        ambientSound: ambientSound || undefined,
        maxCallDurationMs, enableVoicemailDetection, voicemailMessage,
        enableTransferToHuman, transferPhoneNumber,
        analysisSummaryPrompt, analysisSuccessPrompt,
        ...(editingId && { agentId: editingId }),
      };

      await fetch("/api/retell/agents", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      resetForm();
      setShowForm(false);
    } catch (err) {
      console.error("Failed to save agent:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    if (!confirm("Delete this AI agent?")) return;
    try {
      await fetch("/api/retell/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: tenant?._id, agentId }),
      });
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
  };

  if (!tenant) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span>Loading...</span></div>
      </div>
    );
  }

  return (
    <div className="page-full">
      {/* Tenant header */}
      <div className="shrink-0 border-b bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}><Button variant="ghost" size="sm" className="gap-2"><Phone className="h-4 w-4" />Calls</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}><Button variant="ghost" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />SMS</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}><Button variant="ghost" size="sm" className="gap-2"><Users className="h-4 w-4" />Contacts</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}><Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}><Button variant="ghost" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}><Button variant="ghost" size="sm" className="gap-2"><Workflow className="h-4 w-4" />Workflows</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}><Button variant="secondary" size="sm" className="gap-2"><Bot className="h-4 w-4" />AI Agents</Button></Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}><Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings</Button></Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/admin/tenants/${tenant._id}/agents`} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h1 className="page-title">AI Calling Agents</h1>
            <p className="page-description">Configure AI-powered inbound and outbound calling agents for {tenant.name}</p>
          </div>
          {hasRetell && (
            <Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              New Agent
            </Button>
          )}
        </div>

        {/* AI Calling not configured warning */}
        {!hasRetell && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <Bot className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium">AI Calling not configured</p>
              <p className="text-muted-foreground mt-0.5">AI Calling is not configured. Contact your platform administrator.</p>
            </div>
          </div>
        )}

        {/* Agent list */}
        {agents && agents.length > 0 && (
          <div className="space-y-3">
            {agents.map((agent: any) => (
              <div key={agent._id} className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30 shrink-0">
                    {agent.type === "inbound" ? <PhoneIncoming className="h-5 w-5 text-cyan-600" /> :
                     agent.type === "outbound" ? <PhoneOutgoing className="h-5 w-5 text-cyan-600" /> :
                     <Phone className="h-5 w-5 text-cyan-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold">{agent.name}</h3>
                      <Badge variant={agent.isActive ? "default" : "secondary"} className="text-[10px]">
                        {agent.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{agent.type}</Badge>
                    </div>
                    {agent.description && <p className="text-xs text-muted-foreground mb-2">{agent.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Mic className="h-3 w-3" />{agent.voiceModel || "Default"}</span>
                      <span className="flex items-center gap-1"><Brain className="h-3 w-3" />{agent.model || "gpt-4.1-mini"}</span>
                      <span className="flex items-center gap-1"><Volume2 className="h-3 w-3" />{agent.language || "en-US"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link href={`/admin/tenants/${tenant._id}/agents/calling/history?agentId=${agent.retellAgentId}`}>
                      <Button variant="ghost" size="sm" className="text-xs">History</Button>
                    </Link>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(agent._id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {agents && agents.length === 0 && hasRetell && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Phone className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="section-title mb-1">No AI calling agents yet</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create your first AI calling agent to handle inbound calls or make outbound follow-up calls.
            </p>
            <Button onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Agent
            </Button>
          </div>
        )}
      </div>

      {/* Create/Edit Agent Slide-over */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-xl bg-card border-l h-full overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
              <h2 className="text-lg font-semibold">{editingId ? "Edit Agent" : "New AI Calling Agent"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-6">
              {/* Basic Info */}
              <section className="space-y-3">
                <h3 className="section-heading">Basic Info</h3>
                <div className="field-gap">
                  <Label className="text-xs">Agent Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Receptionist Bot" className="h-9 text-sm" />
                </div>
                <div className="field-gap">
                  <Label className="text-xs">Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">Inbound Only</SelectItem>
                      <SelectItem value="outbound">Outbound Only</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="field-gap">
                  <Label className="text-xs">Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Handles incoming calls and routes to agents" className="h-9 text-sm" />
                </div>
              </section>

              {/* Voice */}
              <section className="space-y-3">
                <h3 className="section-heading">Voice</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-gap">
                    <Label className="text-xs">Voice ID *</Label>
                    <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="11labs-Adrian" className="h-9 text-sm" />
                  </div>
                  <div className="field-gap">
                    <Label className="text-xs">Voice Model</Label>
                    <Select value={voiceModel} onValueChange={setVoiceModel}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{VOICE_MODELS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-gap">
                    <Label className="text-xs">Speed ({voiceSpeed}x)</Label>
                    <input type="range" min="0.5" max="2" step="0.1" value={voiceSpeed} onChange={(e) => setVoiceSpeed(Number(e.target.value))} className="w-full" />
                  </div>
                  <div className="field-gap">
                    <Label className="text-xs">Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              {/* Prompt / LLM */}
              <section className="space-y-3">
                <h3 className="section-heading">Instructions & LLM</h3>
                <div className="field-gap">
                  <Label className="text-xs">System Prompt *</Label>
                  <Textarea value={generalPrompt} onChange={(e) => setGeneralPrompt(e.target.value)} placeholder="You are a friendly receptionist for an insurance agency. Your goal is to..." className="text-sm min-h-[120px]" />
                </div>
                <div className="field-gap">
                  <Label className="text-xs">Opening Message</Label>
                  <Input value={beginMessage} onChange={(e) => setBeginMessage(e.target.value)} placeholder="Hi, thank you for calling! How can I help you today?" className="h-9 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-gap">
                    <Label className="text-xs">LLM Model</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{LLM_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="field-gap">
                    <Label className="text-xs">Temperature ({modelTemperature})</Label>
                    <input type="range" min="0" max="1" step="0.1" value={modelTemperature} onChange={(e) => setModelTemperature(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              </section>

              {/* Conversation */}
              <section className="space-y-3">
                <h3 className="section-heading">Conversation</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-gap">
                    <Label className="text-xs">Responsiveness ({responsiveness})</Label>
                    <input type="range" min="0" max="1" step="0.1" value={responsiveness} onChange={(e) => setResponsiveness(Number(e.target.value))} className="w-full" />
                  </div>
                  <div className="field-gap">
                    <Label className="text-xs">Interruption Sensitivity ({interruptionSensitivity})</Label>
                    <input type="range" min="0" max="1" step="0.1" value={interruptionSensitivity} onChange={(e) => setInterruptionSensitivity(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Enable Backchannel ("yeah", "uh-huh")</Label>
                  <Switch checked={enableBackchannel} onCheckedChange={setEnableBackchannel} />
                </div>
                <div className="field-gap">
                  <Label className="text-xs">Ambient Sound</Label>
                  <Select value={ambientSound} onValueChange={setAmbientSound}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>{AMBIENT_SOUNDS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="field-gap">
                  <Label className="text-xs">Max Call Duration (minutes)</Label>
                  <Input type="number" min={1} max={120} value={Math.round(maxCallDurationMs / 60000)} onChange={(e) => setMaxCallDurationMs(Number(e.target.value) * 60000)} className="h-9 text-sm w-24" />
                </div>
              </section>

              {/* Voicemail (outbound) */}
              {(type === "outbound" || type === "both") && (
                <section className="space-y-3">
                  <h3 className="section-heading">Voicemail Detection</h3>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Detect Voicemail</Label>
                    <Switch checked={enableVoicemailDetection} onCheckedChange={setEnableVoicemailDetection} />
                  </div>
                  {enableVoicemailDetection && (
                    <div className="field-gap">
                      <Label className="text-xs">Voicemail Message</Label>
                      <Textarea value={voicemailMessage} onChange={(e) => setVoicemailMessage(e.target.value)} placeholder="Hi, this is a call from..." className="text-sm min-h-[60px]" />
                    </div>
                  )}
                </section>
              )}

              {/* Transfer */}
              <section className="space-y-3">
                <h3 className="section-heading">Transfer to Human</h3>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Enable Transfer</Label>
                  <Switch checked={enableTransferToHuman} onCheckedChange={setEnableTransferToHuman} />
                </div>
                {enableTransferToHuman && (
                  <div className="field-gap">
                    <Label className="text-xs">Transfer Phone Number</Label>
                    <Input value={transferPhoneNumber} onChange={(e) => setTransferPhoneNumber(e.target.value)} placeholder="+15551234567" className="h-9 text-sm" />
                  </div>
                )}
              </section>

              {/* Post-Call Analysis */}
              <section className="space-y-3">
                <h3 className="section-heading">Post-Call Analysis</h3>
                <div className="field-gap">
                  <Label className="text-xs">Summary Prompt</Label>
                  <Textarea value={analysisSummaryPrompt} onChange={(e) => setAnalysisSummaryPrompt(e.target.value)} placeholder="Summarize the key points discussed..." className="text-sm min-h-[60px]" />
                </div>
                <div className="field-gap">
                  <Label className="text-xs">Success Criteria</Label>
                  <Textarea value={analysisSuccessPrompt} onChange={(e) => setAnalysisSuccessPrompt(e.target.value)} placeholder="The call is successful if the caller..." className="text-sm min-h-[60px]" />
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t px-6 py-4 flex gap-3">
              <Button className="flex-1" onClick={handleSave} disabled={!name || !generalPrompt || saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving...</> : editingId ? "Save Changes" : "Create Agent"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
