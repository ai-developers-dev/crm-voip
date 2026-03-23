"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddLeadForm } from "./components/add-lead-form";
import {
  Plus,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Trash2,
  User,
  Car,
  Home,
  AlertTriangle,
  Settings,
  Zap,
  Pencil,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

function formatPremium(monthly?: number | null, annual?: number | null) {
  if (monthly) return `$${monthly.toFixed(2)}/mo`;
  if (annual) return `$${annual.toFixed(2)}/yr`;
  return "—";
}

function formatDob(dob?: string): string {
  if (!dob) return "—";
  // Handle YYYY-MM-DD (from date input)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const [y, m, d] = dob.split("-");
    return `${m}/${d}/${y}`;
  }
  // Fallback: return as-is if already formatted
  return dob;
}

function LeadStatusBadge({ status }: { status: string }) {
  if (status === "quoted") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
        <CheckCircle className="h-3 w-3" /> Quoted
      </Badge>
    );
  }
  if (status === "quoting") {
    return (
      <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1">
        <Clock className="h-3 w-3" /> Quoting…
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" /> New
    </Badge>
  );
}

function QuoteStatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
        <CheckCircle className="h-3 w-3" /> Quoted
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
}

function LeadRow({
  lead,
  onDelete,
  onEdit,
  onRerun,
}: {
  lead: any;
  onDelete: (id: string) => void;
  onEdit: (lead: any) => void;
  onRerun: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete lead for ${lead.firstName} ${lead.lastName}?`)) return;
    onDelete(lead._id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(lead);
  };

  const handleRerun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRerunning(true);
    await onRerun(lead._id);
    setRerunning(false);
  };

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 text-sm font-medium">
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {lead.firstName} {lead.lastName}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {lead.city}, {lead.state}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {formatDob(lead.dob)}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            {lead.quoteTypes?.includes("auto") && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Car className="h-2.5 w-2.5" /> Auto
              </Badge>
            )}
            {lead.quoteTypes?.includes("home") && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Home className="h-2.5 w-2.5" /> Home
              </Badge>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <LeadStatusBadge status={lead.status} />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {new Date(lead.createdAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {/* Rerun — visible when status is error or quoted (re-quote) */}
            {(lead.status === "error" || lead.status === "quoted") && (
              <button
                onClick={handleRerun}
                disabled={rerunning}
                title="Reset and re-queue for quoting"
                className="text-muted-foreground hover:text-blue-400 transition-colors disabled:opacity-40"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              onClick={handleEdit}
              title="Edit lead"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleDelete}
              title="Delete lead"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <span onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </span>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10 border-b border-border">
          <td colSpan={7} className="px-6 py-3 text-xs text-muted-foreground space-y-1">
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
      <tr
        className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 text-sm font-medium">{quote.leadName}</td>
        <td className="px-4 py-3 text-sm capitalize">{quote.type}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{quote.portal}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{quote.carrier ?? "—"}</td>
        <td className="px-4 py-3 text-sm font-semibold text-emerald-400">
          {quote.status === "success" ? formatPremium(quote.monthlyPremium, quote.annualPremium) : "—"}
        </td>
        <td className="px-4 py-3">
          <QuoteStatusBadge status={quote.status} />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {new Date(quote.quotedAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10 border-b border-border">
          <td colSpan={8} className="px-6 py-3">
            {quote.status === "error" && (
              <p className="text-sm text-destructive">Error: {quote.errorMessage ?? "Unknown error"}</p>
            )}
            {quote.quoteId && (
              <p className="text-sm text-muted-foreground">Quote #: {quote.quoteId}</p>
            )}
            {quote.coverageDetails && (
              <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">
                {JSON.stringify(quote.coverageDetails, null, 2)}
              </pre>
            )}
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
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
  const router = useRouter();
  const { organization } = useOrganization();
  const { user } = useUser();

  const org = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const leads = useQuery(
    api.insuranceLeads.list,
    org?._id ? { organizationId: org._id, limit: 200 } : "skip"
  );

  const quotes = useQuery(
    api.quotes.listByOrganization,
    org?._id ? { organizationId: org._id, limit: 100 } : "skip"
  );

  const stats = useQuery(
    api.quotes.getStats,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const currentUser = useQuery(
    api.users.getCurrent,
    user?.id && organization?.id ? { clerkUserId: user.id, clerkOrgId: organization.id } : "skip"
  );

  const ensureInsuranceAgent = useMutation(api.agentTeams.ensureInsuranceQuotingAgent);
  const removeLead = useMutation(api.insuranceLeads.remove);
  const resetLeadStatus = useMutation(api.insuranceLeads.updateStatus);
  const createProject = useMutation(api.projects.create);

  useEffect(() => {
    if (!org?._id) return;
    ensureInsuranceAgent({
      organizationId: org._id,
      modelId: "anthropic/claude-haiku-4.5",
    }).catch(() => {});
  }, [org?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if natgen portal credentials are configured
  const hasNatGenCreds = !!(org?.providerKeys as any)?.natgen_portal;

  const unquotedCount = (leads ?? []).filter((l: any) => l.status === "new").length;

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

  const handleDeleteLead = async (id: string) => {
    try {
      await removeLead({ id: id as any });
    } catch (err) {
      console.error("Failed to delete lead:", err);
    }
  };

  const handleRerunLead = async (id: string) => {
    try {
      await resetLeadStatus({ id: id as any, status: "new" });
    } catch (err) {
      console.error("Failed to reset lead status:", err);
    }
  };

  // Launch the Insurance Quoting Agent directly as a new project
  const handleRunAgent = async () => {
    if (!org?._id || !currentUser?._id) return;
    setLaunching(true);
    try {
      const projectId = await createProject({
        organizationId: org._id,
        createdBy: currentUser._id,
        name: `Insurance Quotes — ${new Date().toLocaleDateString()}`,
        agentType: "insurance_quoting",
      });
      sessionStorage.setItem(
        `initial-message:${projectId}`,
        `Quote all unquoted leads through National General. Use get_unquoted_leads to get the list, then call quote_insurance_lead for each one.`
      );
      router.push(`/project/${projectId}`);
    } catch (err) {
      console.error("Failed to launch agent:", err);
      setLaunching(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Insurance Quotes
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage leads and track automated quotes through carrier portals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasNatGenCreds && unquotedCount > 0 && (
            <Button
              onClick={handleRunAgent}
              disabled={launching}
              variant="secondary"
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              {launching ? "Launching…" : `Run Agent (${unquotedCount} unquoted)`}
            </Button>
          )}
          <Button onClick={() => setShowAddLead(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Credentials warning banner */}
      {!hasNatGenCreds && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-amber-300">National General credentials not configured</p>
            <p className="text-amber-400/80 mt-0.5">
              The quoting agent needs your NatGen agent username and password to log in and run quotes.
            </p>
          </div>
          <Link href="/settings#insurance-portals">
            <Button variant="outline" size="sm" className="gap-1.5 border-amber-500/50 text-amber-300 hover:bg-amber-500/20">
              <Settings className="h-3.5 w-3.5" />
              Add Credentials
            </Button>
          </Link>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <User className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Total Leads</span>
            </div>
            <p className="text-2xl font-bold">{leads?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">{leads?.filter((l: any) => l.status === "new").length ?? 0} unquoted</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Success Rate</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{stats.successRate}%</p>
            <p className="text-xs text-muted-foreground">{stats.successful} successful</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Avg Premium</span>
            </div>
            <p className="text-2xl font-bold">
              {stats.avgMonthlyPremium ? `$${stats.avgMonthlyPremium}/mo` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">monthly average</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">By Type</span>
            </div>
            <div className="flex gap-2 mt-1">
              {Object.entries(stats.byType).map(([type, count]) => (
                <div key={type} className="text-center">
                  <p className="text-sm font-bold">{count as number}</p>
                  <p className="text-xs text-muted-foreground capitalize">{type}</p>
                </div>
              ))}
              {Object.keys(stats.byType).length === 0 && (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("leads")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "leads"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Leads
          {leads && leads.length > 0 && (
            <span className="ml-2 text-xs bg-muted rounded-full px-1.5 py-0.5">{leads.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("quotes")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "quotes"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Quote Results
          {quotes && quotes.length > 0 && (
            <span className="ml-2 text-xs bg-muted rounded-full px-1.5 py-0.5">{quotes.length}</span>
          )}
        </button>
      </div>

      {/* Leads Tab */}
      {activeTab === "leads" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {leads === undefined ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading leads...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <User className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                No leads yet. Click "Add Lead" to add your first insurance lead.
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowAddLead(true)} className="gap-1.5 mt-2">
                <Plus className="h-3.5 w-3.5" /> Add Lead
              </Button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">DOB</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quote Types</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Added</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {(leads as any[]).map((lead) => (
                  <LeadRow
                    key={lead._id}
                    lead={lead}
                    onDelete={handleDeleteLead}
                    onEdit={setEditLead}
                    onRerun={handleRerunLead}
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
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-lg border border-border p-1 bg-muted/30">
              {(["all", "auto", "home"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                    typeFilter === t
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "all" ? "All Types" : t}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg border border-border p-1 bg-muted/30">
              {(["all", "success", "error"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                    statusFilter === s
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "all" ? "All Status" : s}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-auto">
              {filteredQuotes.length} record{filteredQuotes.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {quotes === undefined ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading quotes...</div>
            ) : filteredQuotes.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {quotes.length === 0
                    ? "No quote results yet. Add leads and run the Insurance Quoting Agent to get started."
                    : "No quotes match the current filters."}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Portal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Carrier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Premium</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote: any) => (
                    <QuoteRow key={quote._id} quote={quote} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Add Lead Form */}
      {showAddLead && org?._id && (
        <AddLeadForm
          organizationId={org._id}
          onClose={() => setShowAddLead(false)}
          onAdded={() => { setShowAddLead(false); setActiveTab("leads"); }}
        />
      )}

      {/* Edit Lead Form */}
      {editLead && org?._id && (
        <AddLeadForm
          organizationId={org._id}
          lead={editLead}
          onClose={() => setEditLead(null)}
          onAdded={() => setEditLead(null)}
        />
      )}
    </div>
  );
}
