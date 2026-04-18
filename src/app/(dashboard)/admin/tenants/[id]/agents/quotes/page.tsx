"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Note: credentials are stored as-is in Convex. Encryption happens at rest via Convex.
import {
  Plus, FileText, CheckCircle, XCircle, Clock, TrendingUp,
  DollarSign, ChevronDown, ChevronUp, Trash2, User, Car, Home,
  AlertTriangle, Settings, Zap, Pencil, RotateCcw, Loader2,
  ArrowLeft, Phone, MessageSquare, Users, Calendar, BarChart3, Bot, Briefcase, Workflow, Columns3, ClipboardCheck, FileSignature,
} from "lucide-react";
import Link from "next/link";
import { Compass } from "lucide-react";
import { CarriersSettingsDialog } from "@/components/settings/carriers-settings-dialog";
import { PortalDiscoveryDialog } from "@/components/settings/portal-discovery-dialog";

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
        <td className="px-4 py-3 text-sm font-medium"><div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />{lead.firstName} {lead.lastName}</div></td>
        <td className="px-4 py-3 text-sm text-on-surface-variant">{lead.city}, {lead.state}</td>
        <td className="px-4 py-3 text-sm text-on-surface-variant">{formatDob(lead.dob)}</td>
        <td className="px-4 py-3"><div className="flex gap-1">{lead.quoteTypes?.includes("auto") && <Badge variant="outline" className="gap-1 text-xs"><Car className="h-2.5 w-2.5" /> Auto</Badge>}{lead.quoteTypes?.includes("home") && <Badge variant="outline" className="gap-1 text-xs"><Home className="h-2.5 w-2.5" /> Home</Badge>}</div></td>
        <td className="px-4 py-3"><LeadStatusBadge status={lead.status} /></td>
        <td className="px-4 py-3 text-xs text-on-surface-variant">{new Date(lead.createdAt).toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {(lead.status === "error" || lead.status === "quoted") && <button onClick={async (e) => { e.stopPropagation(); setRerunning(true); await onRerun(lead._id); setRerunning(false); }} disabled={rerunning} className="text-on-surface-variant hover:text-blue-500 transition-colors disabled:opacity-40"><RotateCcw className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`} /></button>}
            <button onClick={(e) => { e.stopPropagation(); onEdit(lead); }} className="text-on-surface-variant hover:text-on-surface transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete lead for ${lead.firstName} ${lead.lastName}?`)) onDelete(lead._id); }} className="text-on-surface-variant hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            <span onClick={() => setExpanded((v) => !v)}>{expanded ? <ChevronUp className="h-4 w-4 text-on-surface-variant" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant" />}</span>
          </div>
        </td>
      </tr>
      {expanded && <tr className="bg-surface-container/10order"><td colSpan={7} className="px-6 py-3 text-xs text-on-surface-variant space-y-1"><p>{lead.street}, {lead.city}, {lead.state} {lead.zip}</p>{lead.email && <p>Email: {lead.email}</p>}{lead.phone && <p>Phone: {lead.phone}</p>}{lead.gender && <p>Gender: {lead.gender}</p>}{lead.maritalStatus && <p>Marital: {lead.maritalStatus}</p>}{lead.notes && <p>Notes: {lead.notes}</p>}</td></tr>}
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
      {expanded && <tr className="bg-surface-container/10order"><td colSpan={8} className="px-6 py-3">{quote.status === "error" && <p className="text-sm text-destructive">Error: {quote.errorMessage ?? "Unknown error"}</p>}{quote.quoteId && <p className="text-sm text-on-surface-variant">Quote #: {quote.quoteId}</p>}{quote.coverageDetails && <pre className="text-xs text-on-surface-variant mt-1 overflow-x-auto">{JSON.stringify(quote.coverageDetails, null, 2)}</pre>}</td></tr>}
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

  // Check for portal credentials in either location
  const hasPortalCreds = (selectedCarriers ?? []).some((tc: any) => tc.portalConfigured)
    || !!(tenant?.settings as any)?.natgenCredentials?.isConfigured;
  const updateNatgenCreds = useMutation(api.organizations.updateNatgenCredentials);
  const unquotedCount = (leads ?? []).filter((l: any) => l.status === "new").length;
  const isAgentRunning = agentRun?.status === "running";

  // Get carrier names for the discovery dialog
  const allCarriers = useQuery(api.agencyCarriers.getAll);

  const [launching, setLaunching] = useState(false);
  const [isCarriersDialogOpen, setIsCarriersDialogOpen] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [natgenUser, setNatgenUser] = useState("");
  const [natgenPass, setNatgenPass] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);
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
        <div className="flex items-center gap-2 text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin" /><span>Loading...</span></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--header-height, 3.5rem))" }}>
      {/* Tenant header with inline nav */}
      <div className="shrink-0 bg-surface px-6 py-3">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1 overflow-x-auto">
            <Link href={`/admin/tenants/${tenant._id}`}><Button variant="ghost" size="sm" className="gap-2"><Phone className="h-4 w-4" />Calls</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}><Button variant="ghost" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />SMS</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}><Button variant="ghost" size="sm" className="gap-2"><Users className="h-4 w-4" />Contacts</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}><Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/tasks`}><Button variant="ghost" size="sm" className="gap-2"><ClipboardCheck className="h-4 w-4" />Tasks</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}><Button variant="ghost" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}><Button variant="ghost" size="sm" className="gap-2"><Workflow className="h-4 w-4" />Workflows</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/pipelines`}><Button variant="ghost" size="sm" className="gap-2"><Columns3 className="h-4 w-4" />Pipelines</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/e-sign`}><Button variant="ghost" size="sm" className="gap-2"><FileSignature className="h-4 w-4" />E-Sign</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}><Button variant="ghost" size="sm" className="gap-2 border-b-2 border-primary rounded-none"><Bot className="h-4 w-4" />AI Agents</Button></Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}><Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings</Button></Link>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Back link + header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/admin/tenants/${tenant._id}/agents`} className="flex h-8 w-8 items-center justify-center rounded-2xl hover:bg-surface-container-high transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="page-title">Insurance Quoting</h1>
              <p className="page-description">Manage leads and automated quotes for {tenant.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasPortalCreds && (
              <Button variant="ghost" size="sm" onClick={() => setIsDiscoveryOpen(true)} className="gap-2">
                <Compass className="h-4 w-4" />
                Auto Discover
              </Button>
            )}
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
          <div className="rounded-2xl borderlue-500/30 bg-blue-500/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Quoting in progress...</p>
                <p className="text-xs text-on-surface-variant">{agentRun.currentLeadName && `Currently: ${agentRun.currentLeadName} | `}{agentRun.succeeded + agentRun.failed}/{agentRun.total} completed</p>
              </div>
              <div className="w-32 h-2 rounded-full bg-surface-container overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round(((agentRun.succeeded + agentRun.failed) / agentRun.total) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Credentials setup */}
        {!hasPortalCreds ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-medium">NatGen Portal Credentials Required</p>
            </div>
            <p className="text-xs text-on-surface-variant">Enter your National General agency portal login to enable automated quoting.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Portal Username</Label>
                <Input value={natgenUser} onChange={(e) => setNatgenUser(e.target.value)} placeholder="Your NatGen user ID" className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Portal Password</Label>
                <Input type="password" value={natgenPass} onChange={(e) => setNatgenPass(e.target.value)} placeholder="Your NatGen password" className="h-9 text-sm mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={!natgenUser || !natgenPass || savingCreds} onClick={async () => {
                console.log("SAVE CLICKED", { natgenUser, natgenPass: natgenPass ? "***" : "EMPTY", tenantId: tenant?._id });
                alert(`Saving credentials for ${natgenUser}...`);
                if (!tenant?._id) { alert("No tenant ID!"); return; }
                setSavingCreds(true);
                try {
                  // Save via API route (server-side, bypasses client auth issues)
                  const res = await fetch("/api/natgen-credentials", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      organizationId: tenant._id,
                      username: natgenUser,
                      password: natgenPass,
                    }),
                    credentials: "include",
                  });
                  if (res.ok) {
                    setCredsSaved(true);
                    setNatgenUser("");
                    setNatgenPass("");
                    setTimeout(() => setCredsSaved(false), 3000);
                  } else {
                    const err = await res.json().catch(() => ({}));
                    console.error("Failed to save credentials:", err);
                    alert(err.error || "Failed to save credentials");
                  }
                } catch (err) {
                  console.error("Failed to save credentials:", err);
                  alert("Failed to save credentials");
                } finally {
                  setSavingCreds(false);
                }
              }}>
                {savingCreds ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Save Credentials
              </Button>
              {credsSaved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Saved!</span>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700 font-medium">NatGen portal credentials configured</span>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => {
              // Allow re-entering credentials
              const settings = tenant?.settings as any;
              const creds = settings?.natgenCredentials;
              if (creds) {
                setNatgenUser(creds.username || "");
                setNatgenPass("");
              }
            }}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          </div>
        )}

        {/* Stats */}
        {statsData && (
          <div className="stats-grid">
            <div className="rounded-xl border bg-surface-container-lowest p-4"><div className="flex items-center gap-2 text-on-surface-variant mb-1"><User className="h-4 w-4" /><span className="section-heading">Total Leads</span></div><p className="stat-value-sm">{leads?.length ?? 0}</p><p className="caption-text">{unquotedCount} unquoted</p></div>
            <div className="rounded-xl border bg-surface-container-lowest p-4"><div className="flex items-center gap-2 text-on-surface-variant mb-1"><CheckCircle className="h-4 w-4" /><span className="section-heading">Success Rate</span></div><p className="stat-value-sm text-emerald-600">{statsData.successRate}%</p><p className="caption-text">{statsData.successful} successful</p></div>
            <div className="rounded-xl border bg-surface-container-lowest p-4"><div className="flex items-center gap-2 text-on-surface-variant mb-1"><DollarSign className="h-4 w-4" /><span className="section-heading">Avg Premium</span></div><p className="stat-value-sm">{statsData.avgMonthlyPremium ? `$${statsData.avgMonthlyPremium}/mo` : "--"}</p></div>
            <div className="rounded-xl border bg-surface-container-lowest p-4"><div className="flex items-center gap-2 text-on-surface-variant mb-1"><TrendingUp className="h-4 w-4" /><span className="section-heading">By Type</span></div><div className="flex gap-2 mt-1">{Object.entries(statsData.byType).map(([type, count]) => <div key={type} className="text-center"><p className="text-sm font-bold">{count as number}</p><p className="caption-text capitalize">{type}</p></div>)}{Object.keys(statsData.byType).length === 0 && <p className="text-sm text-on-surface-variant">No data</p>}</div></div>
          </div>
        )}

        {/* Quote Results */}
            <div className="flex items-center gap-3">
              <div className="flex gap-1 rounded-2xl border p-1 bg-surface-container/30">{(["all", "auto", "home"] as const).map((t) => <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1 text-xs rounded-xl transition-colors capitalize ${typeFilter === t ? "bg-primary text-primary-foreground font-medium" : "text-on-surface-variant hover:text-on-surface"}`}>{t === "all" ? "All Types" : t}</button>)}</div>
              <div className="flex gap-1 rounded-2xl border p-1 bg-surface-container/30">{(["all", "success", "error"] as const).map((s) => <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 text-xs rounded-xl transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground font-medium" : "text-on-surface-variant hover:text-on-surface"}`}>{s === "all" ? "All Status" : s}</button>)}</div>
              <span className="text-xs text-on-surface-variant ml-auto">{filteredQuotes.length} records</span>
            </div>
            <div className="rounded-xl border bg-surface-container-lowest overflow-hidden">
              {quotes === undefined ? <div className="p-8 text-center text-on-surface-variant text-sm">Loading quotes...</div>
              : filteredQuotes.length === 0 ? <div className="p-8 text-center space-y-2"><FileText className="h-8 w-8 text-on-surface-variant/30 mx-auto" /><p className="text-sm text-on-surface-variant">{quotes.length === 0 ? "No quote results yet." : "No quotes match filters."}</p></div>
              : <table className="w-full"><thead><tr className="bg-surface-container/20"><th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Lead</th><th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Type</th><th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Portal</th><th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Carrier</th><th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Premium</th><th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Status</th><th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Date</th><th className="px-4 py-3 w-8" /></tr></thead><tbody>{filteredQuotes.map((q: any) => <QuoteRow key={q._id} quote={q} />)}</tbody></table>}
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

        <PortalDiscoveryDialog
          open={isDiscoveryOpen}
          onOpenChange={setIsDiscoveryOpen}
          organizationId={tenant._id as string}
          carriers={(selectedCarriers ?? [])
            .filter((tc: any) => tc.portalConfigured)
            .map((tc: any) => {
              const carrier = (allCarriers ?? []).find((c: any) => c._id === tc.carrierId);
              return {
                carrierId: tc.carrierId,
                carrierName: carrier?.name ?? "Unknown Carrier",
              };
            })}
        />
      </div>
    </div>
  );
}
