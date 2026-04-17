"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  X, CheckCircle, Loader2, Calculator, AlertCircle,
  Clock, DollarSign, ArrowLeft, ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const QUOTE_STEPS = [
  { key: "login", label: "Login to Portal" },
  { key: "search", label: "Client Search" },
  { key: "client_info", label: "Client Information" },
  { key: "prefill", label: "Quote Prefill (DMV)" },
  { key: "underwriting", label: "Drivers & Vehicles" },
  { key: "coverage", label: "Vehicle Coverages" },
  { key: "premium", label: "Premium Summary" },
];

function QuotingSteps({ status, hasResults, currentStage }: { status: string; hasResults: boolean; currentStage?: string }) {
  const getStepState = (idx: number) => {
    if (hasResults || status === "quoted") return "done";
    if (status === "error") {
      // Find how far we got based on currentStage
      const stageIdx = currentStage ? QUOTE_STEPS.findIndex((s) => s.key === currentStage) : -1;
      if (stageIdx >= 0) {
        if (idx < stageIdx) return "done";
        if (idx === stageIdx) return "error";
        return "pending";
      }
      return idx === 0 ? "error" : "pending";
    }
    if (status === "quoting" && currentStage) {
      const stageIdx = QUOTE_STEPS.findIndex((s) => s.key === currentStage);
      if (stageIdx >= 0) {
        if (idx < stageIdx) return "done";
        if (idx === stageIdx) return "active";
        return "pending";
      }
    }
    if (status === "quoting") {
      // No stage data yet — show first step as active
      return idx === 0 ? "active" : "pending";
    }
    return "pending"; // status === "new"
  };

  return (
    <div className="space-y-1">
      {QUOTE_STEPS.map((step, idx) => {
        const state = getStepState(idx);
        return (
          <div key={step.key} className="flex items-center gap-2.5 py-1">
            <div className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
              state === "done" ? "bg-green-100 text-green-600" :
              state === "active" ? "bg-primary/10 text-primary" :
              state === "error" ? "bg-red-100 text-red-600" :
              "bg-surface-container text-on-surface-variant"
            )}>
              {state === "done" ? <CheckCircle className="h-3 w-3" /> :
               state === "active" ? <Loader2 className="h-3 w-3 animate-spin" /> :
               state === "error" ? <AlertCircle className="h-3 w-3" /> :
               idx + 1}
            </div>
            <span className={cn(
              "text-xs",
              state === "done" ? "text-green-700 font-medium" :
              state === "active" ? "text-primary font-medium" :
              state === "error" ? "text-red-600" :
              "text-on-surface-variant"
            )}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface QuotePanelProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  onClose: () => void;
}

export function QuotePanel({ contact, organizationId, userId, onClose }: QuotePanelProps) {
  const org = useQuery(api.organizations.getById, { organizationId });
  const agencyTypeId = org?.agencyTypeId;

  const carriers = useQuery(
    api.agencyCarriers.getByAgencyType,
    agencyTypeId ? { agencyTypeId } : "skip"
  );
  const products = useQuery(
    api.agencyProducts.getByAgencyType,
    agencyTypeId ? { agencyTypeId } : "skip"
  );
  const selectedCarriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    { organizationId }
  );

  // Get existing leads/quotes for this contact
  const existingLeads = useQuery(api.insuranceLeads.list, {
    organizationId,
    limit: 50,
  });
  const contactLeads = (existingLeads || []).filter(
    (l: any) => l.firstName === contact.firstName && l.lastName === (contact.lastName || "")
  );

  // Get quotes for the most recent lead
  const latestLead = contactLeads[0];
  const leadQuotes = useQuery(
    api.insuranceQuotes.listByLead,
    latestLead?._id ? { insuranceLeadId: latestLead._id } : "skip"
  );

  // Get latest agent run
  const latestRun = useQuery(api.agentRuns.getLatest, { organizationId });

  const createLead = useMutation(api.insuranceLeads.create);
  const removeLead = useMutation(api.insuranceLeads.remove);

  const [selectedCarrierIds, setSelectedCarrierIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [view, setView] = useState<"select" | "status">("select");
  const [submitTime, setSubmitTime] = useState<number>(0); // Track when we clicked submit

  // 2FA pre-flight state
  const [twoFaState, setTwoFaState] = useState<
    | { type: "idle" }
    | { type: "checking"; message: string }
    | { type: "needs_2fa"; sessionId: string; prompt: string }
    | { type: "submitting_2fa" }
    | { type: "verified" }
    | { type: "error"; message: string }
  >({ type: "idle" });
  const [twoFaCode, setTwoFaCode] = useState("");
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);

  const tenantCarrierIds = new Set(selectedCarriers?.map((tc: any) => tc.carrierId) ?? []);
  const availableCarriers = (carriers ?? []).filter(
    (c: any) => c.isActive && (tenantCarrierIds.size === 0 || tenantCarrierIds.has(c._id))
  );
  const availableProducts = (products ?? []).filter(
    (p: any) => p.isActive && (selectedCarrierIds.size === 0 || selectedCarrierIds.has(p.carrierId))
  );

  const toggleCarrier = (id: string) => {
    setSelectedCarrierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handle2faSubmit = async () => {
    if (twoFaState.type !== "needs_2fa" || !twoFaCode.trim()) return;
    const { sessionId } = twoFaState;
    setTwoFaState({ type: "submitting_2fa" });
    try {
      // Send 2FA code to the SAME run-agent session (not portal-test)
      const res = await fetch("/api/quotes/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resume_2fa",
          sessionId,
          code: twoFaCode.trim(),
          organizationId,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (data.status === "started" || data.runId) {
        setTwoFaState({ type: "verified" });
        setTwoFaCode("");
        setView("status");
      } else if (data.status === "needs_2fa") {
        // Code was wrong, still needs 2FA
        setTwoFaState({ type: "needs_2fa", sessionId: data.sessionId, prompt: data.message });
      } else {
        setTwoFaState({ type: "error", message: data.error || data.message || "Verification failed" });
      }
    } catch {
      setTwoFaState({ type: "error", message: "Failed to submit verification code" });
    }
  };

  const handleSubmitQuote = async () => {
    if (selectedCarrierIds.size === 0) return;
    setSubmitting(true);
    setAgentError(null);
    setTwoFaState({ type: "idle" });
    try {
      // Create the lead first
      const quoteTypes: string[] = [];
      for (const pid of selectedProductIds) {
        const product = (products ?? []).find((p: any) => p._id === pid);
        if (product) {
          const typeName = product.name.toLowerCase();
          if (typeName.includes("auto")) quoteTypes.push("auto");
          else if (typeName.includes("home") || typeName.includes("renters")) quoteTypes.push("home");
          else quoteTypes.push(typeName);
        }
      }
      if (quoteTypes.length === 0) quoteTypes.push("auto");

      await createLead({
        organizationId,
        firstName: contact.firstName,
        lastName: contact.lastName || "",
        email: contact.email || undefined,
        phone: contact.phoneNumbers?.find((p) => p.isPrimary)?.number || contact.phoneNumbers?.[0]?.number || undefined,
        dob: contact.dateOfBirth || "1990-01-01",
        gender: contact.gender || undefined,
        maritalStatus: contact.maritalStatus || undefined,
        street: contact.streetAddress || "",
        city: contact.city || "",
        state: contact.state || "",
        zip: contact.zipCode || "",
        quoteTypes: [...new Set(quoteTypes)],
        notes: `Carriers: ${[...selectedCarrierIds].map((id) => availableCarriers.find((c: any) => c._id === id)?.name).filter(Boolean).join(", ")}`,
      });

      // Switch to status view IMMEDIATELY so user sees progress
      setSubmitTime(Date.now());
      setView("status");
      setSubmitting(false);

      // Fire the quote agent in the background (don't await).
      // Abort after 90s so the UI doesn't hang silently if the server stalls —
      // the 2FA path normally returns well under 60s.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);
      fetch("/api/quotes/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
        credentials: "include",
        signal: controller.signal,
      }).then(async (agentRes) => {
        clearTimeout(timeoutId);
        const data = await agentRes.json();
        if (data.status === "needs_2fa") {
          setTwoFaState({ type: "needs_2fa", sessionId: data.sessionId, prompt: data.message });
        } else if (data.error) {
          setAgentError(data.error);
        }
      }).catch((err) => {
        clearTimeout(timeoutId);
        if (err?.name === "AbortError") {
          setAgentError("Login took longer than 90 seconds. Check Railway logs or retry.");
        } else {
          setAgentError(err.message || "Quote agent failed");
        }
      });
    } catch (err) {
      console.error("Failed to submit quote:", err);
      setAgentError("Failed to start quoting agent");
      setTwoFaState({ type: "idle" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Shared 2FA panel (rendered in both status + selection views) ───
  // Hoisted so the status view can show the code input the moment the
  // server returns needs_2fa — previously it only rendered in the
  // selection view's footer, which the user had already left.
  const twoFaPanel = (twoFaState.type === "idle" || twoFaState.type === "verified") ? null : (
    <div className="rounded-lg border bg-amber-50/60 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/30 p-3 space-y-2">
      {twoFaState.type === "checking" && (
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {twoFaState.message}
        </div>
      )}
      {twoFaState.type === "needs_2fa" && (
        <>
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{twoFaState.prompt}</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              placeholder="Enter verification code"
              value={twoFaCode}
              onChange={(e) => setTwoFaCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && twoFaCode.trim()) handle2faSubmit(); }}
              className="h-8 text-sm flex-1"
              autoFocus
            />
            <Button size="sm" className="h-8 text-xs" onClick={handle2faSubmit} disabled={!twoFaCode.trim()}>
              Verify
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
              if (twoFaState.type === "needs_2fa") {
                fetch("/api/quotes/run-agent", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "cleanup", sessionId: twoFaState.sessionId }),
                }).catch(() => {});
              }
              setTwoFaState({ type: "idle" });
              setTwoFaCode("");
            }}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {twoFaState.type === "submitting_2fa" && (
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Submitting verification code...
        </div>
      )}
      {twoFaState.type === "error" && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">{twoFaState.message}</span>
          <button onClick={() => setTwoFaState({ type: "idle" })} className="text-on-surface-variant hover:text-on-surface text-[10px] shrink-0">
            Retry
          </button>
        </div>
      )}
    </div>
  );

  // ── Status View ────────────────────────────────────────────────────
  if (view === "status") {
    const isRunning = latestRun?.status === "running" || latestRun?.status === "started";
    // Only show run status if it started AFTER we clicked submit, or if actively running
    const isRelevantRun = latestRun && (
      isRunning ||
      (latestRun.startedAt && latestRun.startedAt >= submitTime - 5000) // within 5s of submit
    );

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Quote Status
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* 2FA input — visible as soon as server returns needs_2fa,
                regardless of whether the run has started in Convex yet */}
            {twoFaPanel}

            {/* Starting message — show when just submitted but run hasn't started */}
            {submitTime > 0 && !isRelevantRun && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                  <span className="text-sm font-semibold">Starting quote...</span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">Logging into carrier portal</p>
              </div>
            )}

            {/* Agent Run Status — only show for current/recent runs, not stale ones */}
            {isRelevantRun && contactLeads.length > 0 && (
              <div className={cn(
                "rounded-lg border p-3",
                isRunning ? "border-blue-200 bg-blue-50/50" : latestRun.status === "completed" ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  {isRunning && <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />}
                  {latestRun.status === "completed" && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {latestRun.status === "failed" && <AlertCircle className="h-4 w-4 text-red-600" />}
                  <span className="text-sm font-semibold">
                    {isRunning ? "Quoting in progress..." : latestRun.status === "completed" ? "Quoting complete" : "Quoting failed"}
                  </span>
                </div>
                <div className="text-xs text-on-surface-variant space-y-0.5">
                  <p>{latestRun.succeeded} succeeded · {latestRun.failed} failed · {latestRun.total} total</p>
                  {latestRun.currentLeadName && isRunning && (
                    <p>Currently quoting: {latestRun.currentLeadName}</p>
                  )}
                  {latestRun.startedAt && (
                    <p>Started {new Date(latestRun.startedAt).toLocaleTimeString()}</p>
                  )}
                </div>
              </div>
            )}

            {/* Quoting Steps — rendered right under the run status so the
                user sees progress without scrolling past the results. */}
            {contactLeads.length > 0 && (
              isRunning ||
              (leadQuotes?.length ?? 0) > 0 ||
              latestLead?.status === "quoting" ||
              latestLead?.status === "quoted" ||
              latestLead?.status === "error"
            ) && (
              <div>
                <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">Quoting Steps</h4>
                <QuotingSteps status={latestLead?.status || "new"} hasResults={(leadQuotes?.length ?? 0) > 0} currentStage={latestRun?.currentStage ?? undefined} />
              </div>
            )}

            {/* Lead Status */}
            {contactLeads.map((lead: any) => (
              <div key={lead._id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{lead.firstName} {lead.lastName}</p>
                    <p className="text-xs text-on-surface-variant">
                      {lead.quoteTypes?.join(", ")} · {new Date(lead.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={lead.status === "quoted" ? "default" : lead.status === "quoting" ? "secondary" : lead.status === "error" ? "destructive" : "outline"}
                    className="text-[10px]"
                  >
                    {lead.status === "new" && <><Clock className="h-3 w-3 mr-1" />Pending</>}
                    {lead.status === "quoting" && <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Quoting</>}
                    {lead.status === "quoted" && <><CheckCircle className="h-3 w-3 mr-1" />Quoted</>}
                    {lead.status === "error" && <><AlertCircle className="h-3 w-3 mr-1" />Error</>}
                  </Badge>
                </div>

                {lead.notes && (
                  <p className="text-[10px] text-on-surface-variant">{lead.notes}</p>
                )}
              </div>
            ))}

            {/* Quote Results */}
            {leadQuotes && leadQuotes.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">Quote Results</h4>
                <div className="space-y-2">
                  {leadQuotes.map((quote: any) => (
                    <div
                      key={quote._id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        quote.status === "success" ? "border-green-200 hover:bg-green-50/50 cursor-pointer" : "border-red-200"
                      )}
                      onClick={quote.status === "success" && quote.quoteId ? async () => {
                        try {
                          const res = await fetch("/api/portal-test/open-quote", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              organizationId,
                              quoteNumber: quote.quoteId,
                            }),
                          });
                          const data = await res.json();
                          if (data.error) console.error("Open quote failed:", data.error);
                        } catch (e) {
                          console.error("Open quote error:", e);
                        }
                      } : undefined}
                      title={quote.status === "success" && quote.quoteId ? "Click to open quote in carrier portal" : undefined}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{quote.carrier || quote.portal}</span>
                        {quote.status === "success" ? (
                          <Badge variant="default" className="text-xs">
                            {quote.monthlyPremium ? `$${Number(quote.monthlyPremium).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo` : quote.annualPremium ? `$${Number(quote.annualPremium).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/yr` : "Quoted"}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        )}
                      </div>
                      <div className="text-xs text-on-surface-variant space-y-0.5">
                        <p>Type: {quote.type} · Portal: {quote.portal}</p>
                        {quote.quoteId && <p>Quote #: {quote.quoteId}</p>}
                        {quote.annualPremium && <p>Annual: ${Number(quote.annualPremium).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                        {quote.annualPremium && !quote.monthlyPremium && (
                          <p>Monthly: ${(Number(quote.annualPremium) / 12).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        )}
                        {quote.monthlyPremium && <p>Monthly: ${Number(quote.monthlyPremium).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                        {quote.errorMessage && <p className="text-destructive">{quote.errorMessage}</p>}
                        <p>{new Date(quote.quotedAt).toLocaleString()}</p>
                        {quote.status === "success" && quote.quoteId && (
                          <p className="text-primary text-[10px] mt-1">Click to view in portal →</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No quotes yet */}
            {/* Error message */}
            {agentError && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">Agent Error</span>
                </div>
                <p className="text-xs text-red-600">{agentError}</p>
              </div>
            )}

          </div>
        </div>

        {/* Bottom actions */}
        <div className="shrink-0 border-t p-4">
          <Button variant="outline" size="sm" className="w-full" onClick={() => setView("select")}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            New Quote
          </Button>
        </div>
      </div>
    );
  }

  // ── Selection View ─────────────────────────────────────────────────
  const isLoading = carriers === undefined || selectedCarriers === undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header — always renders immediately */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calculator className="h-4 w-4" /> Quote for {contact.firstName}
        </h3>
        <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><X className="h-4 w-4" /></button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p className="text-xs text-on-surface-variant">Loading carriers...</p>
          </div>
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Show existing quote link if any */}
          {contactLeads.length > 0 && (() => {
            const latestSuccessQuote = (leadQuotes || []).filter((q: any) => q.status === "success").sort((a: any, b: any) => b.quotedAt - a.quotedAt)[0];
            const isExpanded = latestSuccessQuote && expandedQuoteId === latestSuccessQuote._id;
            return (
              <div
                className={cn(
                  "w-full rounded-lg border border-green-200 bg-green-50/30 p-3 transition-colors",
                  latestSuccessQuote && "cursor-pointer hover:bg-green-50/60"
                )}
                onClick={() => {
                  if (latestSuccessQuote) {
                    setExpandedQuoteId(isExpanded ? null : latestSuccessQuote._id);
                  }
                }}
              >
                {latestSuccessQuote ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{latestSuccessQuote.carrier || latestSuccessQuote.portal}</span>
                      <span className="text-xs font-bold text-green-700">
                        ${Number(latestSuccessQuote.annualPremium || (latestSuccessQuote.monthlyPremium || 0) * 12).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/yr
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                      <span>{new Date(latestSuccessQuote.quotedAt).toLocaleDateString()}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-primary">{isExpanded ? "Hide details" : "View details"} →</span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("Remove this quote and lead data?")) return;
                            for (const lead of contactLeads) {
                              await removeLead({ id: lead._id });
                            }
                          }}
                          className="text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div
                        className="mt-2 pt-2 border-t border-green-200/60 text-[11px] text-on-surface-variant space-y-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {latestSuccessQuote.quoteId && (
                          <p><span className="font-semibold">Quote #:</span> {latestSuccessQuote.quoteId}</p>
                        )}
                        {latestSuccessQuote.monthlyPremium && (
                          <p><span className="font-semibold">Monthly:</span> ${Number(latestSuccessQuote.monthlyPremium).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        )}
                        {latestSuccessQuote.annualPremium && (
                          <p><span className="font-semibold">Annual:</span> ${Number(latestSuccessQuote.annualPremium).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        )}
                        {latestSuccessQuote.type && (
                          <p><span className="font-semibold">Type:</span> {latestSuccessQuote.type}</p>
                        )}
                        {latestSuccessQuote.portal && (
                          <p><span className="font-semibold">Portal:</span> {latestSuccessQuote.portal}</p>
                        )}
                        {(() => {
                          const cd = (latestSuccessQuote.coverageDetails ?? {}) as Record<string, unknown>;
                          // Only render known, human-readable coverage fields.
                          // `coverages` (empty array) and `rawText` (portal dump)
                          // used to leak through as "coverages: []" and a huge
                          // rawText blob — hide those.
                          const candidateRows: Array<[string, unknown]> = [
                            ["Coverage Level", cd.coverageLevel],
                            ["Bodily Injury", cd.bodilyInjury],
                            ["Property Damage", cd.propertyDamage],
                            ["Medical Payments", cd.medicalPayments],
                            ["Uninsured Motorist", cd.uninsuredMotorist],
                            ["Collision Deductible", cd.collisionDeductible],
                            ["Comprehensive Deductible", cd.comprehensiveDeductible],
                            ["All Perils Deductible", cd.allPerilsDeductible],
                            ["Windstorm Deductible", cd.windstormDeductible],
                          ];
                          const rows = candidateRows.filter(
                            ([, v]) => v !== undefined && v !== null && v !== ""
                          );
                          if (rows.length === 0) return null;
                          return (
                            <div>
                              <p className="font-semibold mt-2">Coverages:</p>
                              <ul className="pl-4 list-disc space-y-0.5">
                                {rows.map(([label, value]) => (
                                  <li key={label}>
                                    <span className="font-medium">{label}:</span> {String(value)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })()}
                        {latestSuccessQuote.quoteId && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch("/api/portal-test/open-quote", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    organizationId,
                                    quoteNumber: latestSuccessQuote.quoteId,
                                  }),
                                });
                                const data = await res.json();
                                if (data.error) console.error("Open quote failed:", data.error);
                              } catch (e) {
                                console.error("Open quote error:", e);
                              }
                            }}
                            className="mt-2 text-primary text-[11px] font-medium hover:underline"
                          >
                            Open in carrier portal →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">Quote in progress...</span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        for (const lead of contactLeads) {
                          await removeLead({ id: lead._id });
                        }
                      }}
                      className="text-[10px] text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Carriers */}
          <section>
            <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-2">Select Carriers</h4>
            {availableCarriers.length === 0 ? (
              <p className="text-xs text-on-surface-variant">No carriers configured. Add carriers in Settings.</p>
            ) : (
              <div className="space-y-1.5">
                {availableCarriers.map((carrier: any) => (
                  <button
                    key={carrier._id}
                    type="button"
                    onClick={() => toggleCarrier(carrier._id)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                      selectedCarrierIds.has(carrier._id)
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:bg-surface-container/50"
                    )}
                  >
                    <div className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md border text-xs",
                      selectedCarrierIds.has(carrier._id) ? "bg-primary border-primary text-primary-foreground" : "border-border"
                    )}>
                      {selectedCarrierIds.has(carrier._id) && <CheckCircle className="h-3 w-3" />}
                    </div>
                    <p className="text-sm font-medium">{carrier.name}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Lines of Business */}
          {selectedCarrierIds.size > 0 && availableProducts.length > 0 && (
            <section>
              <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-2">Lines of Business</h4>
              <div className="space-y-1.5">
                {availableProducts.map((product: any) => {
                  const carrier = availableCarriers.find((c: any) => c._id === product.carrierId);
                  return (
                    <button
                      key={product._id}
                      type="button"
                      onClick={() => toggleProduct(product._id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all",
                        selectedProductIds.has(product._id)
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "hover:bg-surface-container/50"
                      )}
                    >
                      <div className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border text-xs",
                        selectedProductIds.has(product._id) ? "bg-primary border-primary text-primary-foreground" : "border-border"
                      )}>
                        {selectedProductIds.has(product._id) && <CheckCircle className="h-3 w-3" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{product.name}</p>
                        {carrier && <p className="text-[10px] text-on-surface-variant">{carrier.name}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      )}

      {/* 2FA Verification — shared with status view */}
      {twoFaPanel && (
        <div className="shrink-0 border-t px-4 py-3">
          {twoFaPanel}
        </div>
      )}

      {/* Submit */}
      <div className="shrink-0 border-t p-4">
        <Button
          className="w-full"
          onClick={handleSubmitQuote}
          disabled={selectedCarrierIds.size === 0 || submitting || twoFaState.type === "needs_2fa" || twoFaState.type === "submitting_2fa" || twoFaState.type === "checking"}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Verifying login...</>
          ) : (
            <><Calculator className="h-4 w-4 mr-1.5" /> Submit for Quote</>
          )}
        </Button>
      </div>
    </div>
  );
}
