"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useOrganization } from "@clerk/nextjs";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddLeadForm } from "@/components/quotes/add-lead-form";
import {
  Plus, FileText, CheckCircle, XCircle, Clock, TrendingUp,
  DollarSign, ChevronDown, ChevronUp, Trash2, User, Car, Home,
  AlertTriangle, Settings, Zap, Pencil, RotateCcw, Loader2,
} from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";

function formatPremium(monthly?: number | null, annual?: number | null) {
  if (monthly) return `$${monthly.toFixed(2)}/mo`;
  if (annual) return `$${annual.toFixed(2)}/yr`;
  return "--";
}

function formatDob(dob?: string): string {
  if (!dob) return "--";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const [y, m, d] = dob.split("-");
    return `${m}/${d}/${y}`;
  }
  return dob;
}

function LeadStatusBadge({ status }: { status: string }) {
  if (status === "quoted") return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle className="h-3 w-3" /> Quoted</Badge>;
  if (status === "quoting") return <Badge className="bg-blue-500/15 text-blue-600lue-500/30 gap-1"><Clock className="h-3 w-3" /> Quoting...</Badge>;
  if (status === "error") return <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1"><XCircle className="h-3 w-3" /> Error</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> New</Badge>;
}

function QuoteStatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle className="h-3 w-3" /> Quoted</Badge>;
  if (status === "error") return <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1"><XCircle className="h-3 w-3" /> Error</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
}

function LeadRow({ lead, onDelete, onEdit, onRerun }: { lead: any; onDelete: (id: string) => void; onEdit: (lead: any) => void; onRerun: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  return (
    <>
      <tr className="hover:bg-surface-container-high/30 transition-colors cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="px-4 py-3 text-sm font-medium">
          <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />{lead.firstName} {lead.lastName}</div>
        </td>
        <td className="px-4 py-3 text-sm text-on-surface-variant">{lead.city}, {lead.state}</td>
        <td className="px-4 py-3 text-sm text-on-surface-variant">{formatDob(lead.dob)}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            {lead.quoteTypes?.includes("auto") && <Badge variant="outline" className="gap-1 text-xs"><Car className="h-2.5 w-2.5" /> Auto</Badge>}
            {lead.quoteTypes?.includes("home") && <Badge variant="outline" className="gap-1 text-xs"><Home className="h-2.5 w-2.5" /> Home</Badge>}
          </div>
        </td>
        <td className="px-4 py-3"><LeadStatusBadge status={lead.status} /></td>
        <td className="px-4 py-3 text-xs text-on-surface-variant">{new Date(lead.createdAt).toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {(lead.status === "error" || lead.status === "quoted") && (
              <button onClick={async (e) => { e.stopPropagation(); setRerunning(true); await onRerun(lead._id); setRerunning(false); }} disabled={rerunning} title="Reset and re-queue" className="text-on-surface-variant hover:text-blue-500 transition-colors disabled:opacity-40">
                <RotateCcw className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`} />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onEdit(lead); }} title="Edit lead" className="text-on-surface-variant hover:text-on-surface transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete lead for ${lead.firstName} ${lead.lastName}?`)) onDelete(lead._id); }} title="Delete lead" className="text-on-surface-variant hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            <span onClick={() => setExpanded((v) => !v)}>{expanded ? <ChevronUp className="h-4 w-4 text-on-surface-variant" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant" />}</span>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-container/10order">
          <td colSpan={7} className="px-6 py-3 text-xs text-on-surface-variant space-y-1">
            <p>{lead.street}, {lead.city}, {lead.state} {lead.zip}</p>
            {lead.email && <p>Email: {lead.email}</p>}
            {lead.phone && <p>Phone: {lead.phone}</p>}
            {lead.gender && <p>Gender: {lead.gender}</p>}
            {lead.maritalStatus && <p>Marital: {lead.maritalStatus}</p>}
            {lead.notes && <p>Notes: {lead.notes}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function QuoteRow({ quote }: { quote: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="hover:bg-surface-container-high/30 transition-colors cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="px-4 py-3 text-sm font-medium">{quote.leadName}</td>
        <td className="px-4 py-3 text-sm capitalize">{quote.type}</td>
        <td className="px-4 py-3 text-sm text-on-surface-variant capitalize">{quote.portal}</td>
        <td className="px-4 py-3 text-sm text-on-surface-variant">{quote.carrier ?? "--"}</td>
        <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{quote.status === "success" ? formatPremium(quote.monthlyPremium, quote.annualPremium) : "--"}</td>
        <td className="px-4 py-3"><QuoteStatusBadge status={quote.status} /></td>
        <td className="px-4 py-3 text-xs text-on-surface-variant">{new Date(quote.quotedAt).toLocaleDateString()}</td>
        <td className="px-4 py-3 text-on-surface-variant">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
      </tr>
      {expanded && (
        <tr className="bg-surface-container/10order">
          <td colSpan={8} className="px-6 py-3">
            {quote.status === "error" && <p className="text-sm text-destructive">Error: {quote.errorMessage ?? "Unknown error"}</p>}
            {quote.quoteId && <p className="text-sm text-on-surface-variant">Quote #: {quote.quoteId}</p>}
            {quote.coverageDetails && <pre className="text-xs text-on-surface-variant mt-1 overflow-x-auto">{JSON.stringify(quote.coverageDetails, null, 2)}</pre>}
            <div className="text-xs text-on-surface-variant mt-1 space-y-0.5">
              {quote.leadEmail && <p>Email: {quote.leadEmail}</p>}
              {quote.leadPhone && <p>Phone: {quote.leadPhone}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function QuotesPage() {
  const { organization } = useOrganization();

  const org = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const leads = useQuery(
    api.insuranceLeads.list,
    org?._id ? { organizationId: org._id, limit: 200 } : "skip"
  );

  const quotes = useQuery(
    api.insuranceQuotes.listByOrganization,
    org?._id ? { organizationId: org._id, limit: 100 } : "skip"
  );

  const stats = useQuery(
    api.insuranceQuotes.getStats,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const agentRun = useQuery(
    api.agentRuns.getLatest,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const removeLead = useMutation(api.insuranceLeads.remove);
  const resetLeadStatus = useMutation(api.insuranceLeads.updateStatus);

  const hasNatGenCreds = !!(org?.settings as any)?.natgenCredentials?.isConfigured;
  const unquotedCount = (leads ?? []).filter((l: any) => l.status === "new").length;
  const isAgentRunning = agentRun?.status === "running";

  const [showAddLead, setShowAddLead] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const [launching, setLaunching] = useState(false);
  const [activeTab, setActiveTab] = useState<"leads" | "quotes">("leads");
  const [typeFilter, setTypeFilter] = useState<"all" | "auto" | "home">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");

  const filteredQuotes = (quotes ?? []).filter((q: any) => {
    if (typeFilter !== "all" && q.type !== typeFilter) return false;
    if (statusFilter !== "all" && q.status !== statusFilter) return false;
    return true;
  });

  const handleRunAgent = async () => {
    if (!org?._id) return;
    setLaunching(true);
    try {
      await fetch("/api/quotes/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org._id }),
      });
    } catch (err) {
      console.error("Failed to launch agent:", err);
    } finally {
      setLaunching(false);
    }
  };

  if (!org) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin" /><span>Loading...</span></div>
      </div>
    );
  }

  return (
    <PageContainer variant="scroll">
      <PageHeader
        title="Insurance Quotes"
        description="Manage leads and track automated quotes through carrier portals."
        action={
          <>
            {hasNatGenCreds && unquotedCount > 0 && !isAgentRunning && (
              <Button onClick={handleRunAgent} disabled={launching} variant="secondary" className="gap-2">
                <Zap className="h-4 w-4" />
                {launching ? "Launching..." : `Run Agent (${unquotedCount} unquoted)`}
              </Button>
            )}
            <Button onClick={() => setShowAddLead(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Lead
            </Button>
          </>
        }
      />

      {/* Agent progress bar */}
      {isAgentRunning && agentRun && (
        <div className="rounded-2xl borderlue-500/30 bg-blue-500/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Quoting in progress...</p>
              <p className="text-xs text-on-surface-variant">
                {agentRun.currentLeadName && `Currently: ${agentRun.currentLeadName} | `}
                {agentRun.succeeded + agentRun.failed}/{agentRun.total} completed
                {agentRun.succeeded > 0 && ` (${agentRun.succeeded} succeeded)`}
                {agentRun.failed > 0 && ` (${agentRun.failed} failed)`}
              </p>
            </div>
            <div className="w-32 h-2 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.round(((agentRun.succeeded + agentRun.failed) / agentRun.total) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Credentials warning */}
      {!hasNatGenCreds && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium">National General credentials not configured</p>
            <p className="text-on-surface-variant mt-0.5">The quoting agent needs your NatGen agent username and password to log in and run quotes.</p>
          </div>
          <Link href="/settings">
            <Button variant="outline" size="sm" className="gap-1.5"><Settings className="h-3.5 w-3.5" />Add Credentials</Button>
          </Link>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <StatCard icon={User} label="Total Leads" value={leads?.length ?? 0} caption={`${unquotedCount} unquoted`} />
          <StatCard icon={CheckCircle} label="Success Rate" value={`${stats.successRate}%`} caption={`${stats.successful} successful`} valueClassName="text-emerald-600" />
          <StatCard icon={DollarSign} label="Avg Premium" value={stats.avgMonthlyPremium ? `$${stats.avgMonthlyPremium}/mo` : "--"} caption="monthly average" />
          <div className="rounded-xl border bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2 text-on-surface-variant mb-1"><TrendingUp className="h-4 w-4" /><span className="section-heading">By Type</span></div>
            <div className="flex gap-2 mt-1">
              {Object.entries(stats.byType).map(([type, count]) => (
                <div key={type} className="text-center"><p className="text-sm font-bold">{count as number}</p><p className="caption-text capitalize">{type}</p></div>
              ))}
              {Object.keys(stats.byType).length === 0 && <p className="text-sm text-on-surface-variant">No data yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1order">
        <button onClick={() => setActiveTab("leads")} className={`px-4 py-2 text-sm font-medium transition-colors-2 -mb-px ${activeTab === "leads" ? "border-primary text-foreground" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}>
          Leads{leads && leads.length > 0 && <span className="ml-2 text-xs bg-surface-container rounded-full px-1.5 py-0.5">{leads.length}</span>}
        </button>
        <button onClick={() => setActiveTab("quotes")} className={`px-4 py-2 text-sm font-medium transition-colors-2 -mb-px ${activeTab === "quotes" ? "border-primary text-foreground" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}>
          Quote Results{quotes && quotes.length > 0 && <span className="ml-2 text-xs bg-surface-container rounded-full px-1.5 py-0.5">{quotes.length}</span>}
        </button>
      </div>

      {/* Leads Tab */}
      {activeTab === "leads" && (
        <div className="rounded-xl border bg-surface-container-lowest overflow-hidden">
          {leads === undefined ? (
            <div className="p-8 text-center text-on-surface-variant text-sm">Loading leads...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <User className="h-8 w-8 text-on-surface-variant/30 mx-auto" />
              <p className="text-sm text-on-surface-variant">No leads yet. Click "Add Lead" to add your first insurance lead.</p>
              <Button variant="outline" size="sm" onClick={() => setShowAddLead(true)} className="gap-1.5 mt-2"><Plus className="h-3.5 w-3.5" /> Add Lead</Button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container/20">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">DOB</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Quote Types</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Added</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {(leads as any[]).map((lead) => (
                  <LeadRow
                    key={lead._id}
                    lead={lead}
                    onDelete={(id) => removeLead({ id: id as any })}
                    onEdit={setEditLead}
                    onRerun={(id) => resetLeadStatus({ id: id as any, status: "new" })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Quotes Tab */}
      {activeTab === "quotes" && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-2xl border p-1 bg-surface-container/30">
              {(["all", "auto", "home"] as const).map((t) => (
                <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1 text-xs rounded-xl transition-colors capitalize ${typeFilter === t ? "bg-primary text-primary-foreground font-medium" : "text-on-surface-variant hover:text-on-surface"}`}>
                  {t === "all" ? "All Types" : t}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-2xl border p-1 bg-surface-container/30">
              {(["all", "success", "error"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 text-xs rounded-xl transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground font-medium" : "text-on-surface-variant hover:text-on-surface"}`}>
                  {s === "all" ? "All Status" : s}
                </button>
              ))}
            </div>
            <span className="text-xs text-on-surface-variant ml-auto">{filteredQuotes.length} record{filteredQuotes.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="rounded-xl border bg-surface-container-lowest overflow-hidden">
            {quotes === undefined ? (
              <div className="p-8 text-center text-on-surface-variant text-sm">Loading quotes...</div>
            ) : filteredQuotes.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <FileText className="h-8 w-8 text-on-surface-variant/30 mx-auto" />
                <p className="text-sm text-on-surface-variant">{quotes.length === 0 ? "No quote results yet. Add leads and run the agent to get started." : "No quotes match the current filters."}</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container/20">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Lead</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Portal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Carrier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Premium</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>{filteredQuotes.map((quote: any) => <QuoteRow key={quote._id} quote={quote} />)}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showAddLead && org?._id && <AddLeadForm organizationId={org._id} onClose={() => setShowAddLead(false)} onAdded={() => { setShowAddLead(false); setActiveTab("leads"); }} />}
      {editLead && org?._id && <AddLeadForm organizationId={org._id} lead={editLead} onClose={() => setEditLead(null)} onAdded={() => setEditLead(null)} />}
    </PageContainer>
  );
}
