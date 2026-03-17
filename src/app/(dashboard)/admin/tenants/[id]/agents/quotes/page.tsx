"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, FileText, CheckCircle, XCircle, Clock, TrendingUp,
  DollarSign, ChevronDown, ChevronUp, Trash2, User, Car, Home,
  AlertTriangle, Settings, Zap, Pencil, RotateCcw, Loader2,
  ArrowLeft, Phone, MessageSquare, Users, Calendar, BarChart3, Bot, Briefcase, Workflow,
} from "lucide-react";
import Link from "next/link";
import { CarriersSettingsDialog } from "@/components/settings/carriers-settings-dialog";

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
  if (status === "quoting") return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 gap-1"><Clock className="h-3 w-3" /> Quoting...</Badge>;
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
      <tr className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="px-4 py-3 text-sm font-medium"><div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{lead.firstName} {lead.lastName}</div></td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{lead.city}, {lead.state}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{formatDob(lead.dob)}</td>
        <td className="px-4 py-3"><div className="flex gap-1">{lead.quoteTypes?.includes("auto") && <Badge variant="outline" className="gap-1 text-xs"><Car className="h-2.5 w-2.5" /> Auto</Badge>}{lead.quoteTypes?.includes("home") && <Badge variant="outline" className="gap-1 text-xs"><Home className="h-2.5 w-2.5" /> Home</Badge>}</div></td>
        <td className="px-4 py-3"><LeadStatusBadge status={lead.status} /></td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {(lead.status === "error" || lead.status === "quoted") && <button onClick={async (e) => { e.stopPropagation(); setRerunning(true); await onRerun(lead._id); setRerunning(false); }} disabled={rerunning} className="text-muted-foreground hover:text-blue-500 transition-colors disabled:opacity-40"><RotateCcw className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`} /></button>}
            <button onClick={(e) => { e.stopPropagation(); onEdit(lead); }} className="text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete lead for ${lead.firstName} ${lead.lastName}?`)) onDelete(lead._id); }} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            <span onClick={() => setExpanded((v) => !v)}>{expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}</span>
          </div>
        </td>
      </tr>
      {expanded && <tr className="bg-muted/10 border-b border-border"><td colSpan={7} className="px-6 py-3 text-xs text-muted-foreground space-y-1"><p>{lead.street}, {lead.city}, {lead.state} {lead.zip}</p>{lead.email && <p>Email: {lead.email}</p>}{lead.phone && <p>Phone: {lead.phone}</p>}{lead.gender && <p>Gender: {lead.gender}</p>}{lead.maritalStatus && <p>Marital: {lead.maritalStatus}</p>}{lead.notes && <p>Notes: {lead.notes}</p>}</td></tr>}
    </>
  );
}

function QuoteRow({ quote }: { quote: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="px-4 py-3 text-sm font-medium">{quote.leadName}</td>
        <td className="px-4 py-3 text-sm capitalize">{quote.type}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{quote.portal}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{quote.carrier ?? "--"}</td>
        <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{quote.status === "success" ? formatPremium(quote.monthlyPremium, quote.annualPremium) : "--"}</td>
        <td className="px-4 py-3"><QuoteStatusBadge status={quote.status} /></td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(quote.quotedAt).toLocaleDateString()}</td>
        <td className="px-4 py-3 text-muted-foreground">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
      </tr>
      {expanded && <tr className="bg-muted/10 border-b border-border"><td colSpan={8} className="px-6 py-3">{quote.status === "error" && <p className="text-sm text-destructive">Error: {quote.errorMessage ?? "Unknown error"}</p>}{quote.quoteId && <p className="text-sm text-muted-foreground">Quote #: {quote.quoteId}</p>}{quote.coverageDetails && <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">{JSON.stringify(quote.coverageDetails, null, 2)}</pre>}</td></tr>}
    </>
  );
}

export default function TenantQuotesPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  const leads = useQuery(
    api.insuranceLeads.list,
    tenant?._id ? { organizationId: tenant._id, limit: 200 } : "skip"
  );

  const quotes = useQuery(
    api.insuranceQuotes.listByOrganization,
    tenant?._id ? { organizationId: tenant._id, limit: 100 } : "skip"
  );

  const statsData = useQuery(
    api.insuranceQuotes.getStats,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const agentRun = useQuery(
    api.agentRuns.getLatest,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const selectedCarriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const removeLead = useMutation(api.insuranceLeads.remove);
  const resetLeadStatus = useMutation(api.insuranceLeads.updateStatus);

  // Check for any carrier with portal credentials configured
  const hasPortalCreds = (selectedCarriers ?? []).some((tc: any) => tc.portalConfigured);
  const unquotedCount = (leads ?? []).filter((l: any) => l.status === "new").length;
  const isAgentRunning = agentRun?.status === "running";

  const [launching, setLaunching] = useState(false);
  const [isCarriersDialogOpen, setIsCarriersDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "auto" | "home">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");

  const filteredQuotes = (quotes ?? []).filter((q: any) => {
    if (typeFilter !== "all" && q.type !== typeFilter) return false;
    if (statusFilter !== "all" && q.status !== statusFilter) return false;
    return true;
  });

  const handleRunAgent = async () => {
    if (!tenant?._id) return;
    setLaunching(true);
    try {
      await fetch("/api/quotes/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: tenant._id }),
      });
    } catch (err) {
      console.error("Failed to launch agent:", err);
    } finally {
      setLaunching(false);
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
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--header-height, 3.5rem))" }}>
      {/* Tenant header with inline nav */}
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

      {/* Page content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Back link + header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/admin/tenants/${tenant._id}/agents`} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="page-title">Insurance Quoting</h1>
              <p className="page-description">Manage leads and automated quotes for {tenant.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasPortalCreds && unquotedCount > 0 && !isAgentRunning && (
              <Button onClick={handleRunAgent} disabled={launching} variant="secondary" className="gap-2">
                <Zap className="h-4 w-4" />
                {launching ? "Launching..." : `Run Agent (${unquotedCount} unquoted)`}
              </Button>
            )}
          </div>
        </div>

        {/* Agent progress */}
        {isAgentRunning && agentRun && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Quoting in progress...</p>
                <p className="text-xs text-muted-foreground">{agentRun.currentLeadName && `Currently: ${agentRun.currentLeadName} | `}{agentRun.succeeded + agentRun.failed}/{agentRun.total} completed</p>
              </div>
              <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round(((agentRun.succeeded + agentRun.failed) / agentRun.total) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Credentials warning */}
        {!hasPortalCreds && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium">Carrier portal credentials not configured</p>
              <p className="text-muted-foreground mt-0.5">Add portal login credentials in Carrier Settings to enable automated quoting.</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsCarriersDialogOpen(true)}>
              <Briefcase className="h-3.5 w-3.5" />Carrier Settings
            </Button>
          </div>
        )}

        {/* Stats */}
        {statsData && (
          <div className="stats-grid">
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><User className="h-4 w-4" /><span className="section-heading">Total Leads</span></div><p className="stat-value-sm">{leads?.length ?? 0}</p><p className="caption-text">{unquotedCount} unquoted</p></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><CheckCircle className="h-4 w-4" /><span className="section-heading">Success Rate</span></div><p className="stat-value-sm text-emerald-600">{statsData.successRate}%</p><p className="caption-text">{statsData.successful} successful</p></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><DollarSign className="h-4 w-4" /><span className="section-heading">Avg Premium</span></div><p className="stat-value-sm">{statsData.avgMonthlyPremium ? `$${statsData.avgMonthlyPremium}/mo` : "--"}</p></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /><span className="section-heading">By Type</span></div><div className="flex gap-2 mt-1">{Object.entries(statsData.byType).map(([type, count]) => <div key={type} className="text-center"><p className="text-sm font-bold">{count as number}</p><p className="caption-text capitalize">{type}</p></div>)}{Object.keys(statsData.byType).length === 0 && <p className="text-sm text-muted-foreground">No data</p>}</div></div>
          </div>
        )}

        {/* Quote Results */}
            <div className="flex items-center gap-3">
              <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">{(["all", "auto", "home"] as const).map((t) => <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${typeFilter === t ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>{t === "all" ? "All Types" : t}</button>)}</div>
              <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">{(["all", "success", "error"] as const).map((s) => <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>{s === "all" ? "All Status" : s}</button>)}</div>
              <span className="text-xs text-muted-foreground ml-auto">{filteredQuotes.length} records</span>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              {quotes === undefined ? <div className="p-8 text-center text-muted-foreground text-sm">Loading quotes...</div>
              : filteredQuotes.length === 0 ? <div className="p-8 text-center space-y-2"><FileText className="h-8 w-8 text-muted-foreground/30 mx-auto" /><p className="text-sm text-muted-foreground">{quotes.length === 0 ? "No quote results yet." : "No quotes match filters."}</p></div>
              : <table className="w-full"><thead><tr className="border-b border-border bg-muted/20"><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Portal</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Carrier</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Premium</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th><th className="px-4 py-3 w-8" /></tr></thead><tbody>{filteredQuotes.map((q: any) => <QuoteRow key={q._id} quote={q} />)}</tbody></table>}
            </div>

        {tenant?.clerkOrgId && (
          <CarriersSettingsDialog
            open={isCarriersDialogOpen}
            onOpenChange={setIsCarriersDialogOpen}
            organizationId={tenant._id}
            clerkOrgId={tenant.clerkOrgId}
            initialAgencyTypeId={tenant.agencyTypeId}
          />
        )}
      </div>
    </div>
  );
}
