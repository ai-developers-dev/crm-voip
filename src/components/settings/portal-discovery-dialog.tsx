"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { Loader2, Compass, Copy, CheckCircle, AlertCircle, ChevronRight, ShieldCheck } from "lucide-react";

interface PortalDiscoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  carriers: Array<{ carrierId: string; carrierName: string }>;
}

type DiscoveryStatus = "idle" | "discovering" | "done" | "error";

export function PortalDiscoveryDialog({
  open,
  onOpenChange,
  organizationId,
  carriers,
}: PortalDiscoveryDialogProps) {
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  // Fetch contacts for the contact picker
  const contacts = useQuery(api.contacts.getByOrganization, { organizationId: organizationId as Id<"organizations"> });
  const [status, setStatus] = useState<DiscoveryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [activeScreen, setActiveScreen] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["inputs"]));

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const [discoveryAction, setDiscoveryAction] = useState<string>("dashboard_only");
  const [twoFaSessionId, setTwoFaSessionId] = useState<string | null>(null);
  const [twoFaMessage, setTwoFaMessage] = useState<string>("");
  const [twoFaCode, setTwoFaCode] = useState("");

  const callDiscoverApi = async (extraBody: Record<string, string> = {}) => {
    const res = await fetch("/api/portal-test/discover-selectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        carrierId: selectedCarrierId,
        action: discoveryAction,
        ...(selectedContactId && { contactId: selectedContactId }),
        ...extraBody,
      }),
      credentials: "include",
    });
    return res.json();
  };

  const handleDiscover = async () => {
    if (!selectedCarrierId) return;
    setStatus("discovering");
    setError(null);
    setResults(null);
    setTwoFaSessionId(null);
    setTwoFaCode("");

    try {
      const data = await callDiscoverApi();

      // Handle 2FA
      if (data.status === "needs_2fa") {
        setTwoFaSessionId(data.sessionId);
        setTwoFaMessage(data.message || "Enter the verification code sent to your phone.");
        setStatus("idle"); // Show 2FA input
        return;
      }

      if (data.error) {
        setStatus("error");
        setError(data.error);
        return;
      }

      setResults(data);
      setStatus("done");

      // Auto-select first screen
      if (data.screens) {
        const firstScreen = Object.keys(data.screens)[0];
        if (firstScreen) setActiveScreen(firstScreen);
      }
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "Discovery failed");
    }
  };

  const handle2faSubmit = async () => {
    if (!twoFaSessionId || !twoFaCode.trim()) return;
    setStatus("discovering");
    try {
      const data = await callDiscoverApi({
        action: "resume_2fa",
        sessionId: twoFaSessionId,
        code: twoFaCode.trim(),
      });

      setTwoFaSessionId(null);
      setTwoFaCode("");

      if (data.status === "needs_2fa") {
        setTwoFaSessionId(data.sessionId);
        setTwoFaMessage(data.message || "Code incorrect. Try again.");
        setStatus("idle");
        return;
      }

      if (data.error) {
        setStatus("error");
        setError(data.error);
        return;
      }

      setResults(data);
      setStatus("done");
      if (data.screens) {
        const firstScreen = Object.keys(data.screens)[0];
        if (firstScreen) setActiveScreen(firstScreen);
      }
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "2FA verification failed");
    }
  };

  const handleCopyJson = async () => {
    if (!results) return;
    await navigator.clipboard.writeText(JSON.stringify(results, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const screenNames = results?.screens ? Object.keys(results.screens) : [];
  const currentScreenData = activeScreen && results?.screens?.[activeScreen];

  // Format screen name for display: "clientInformation" → "Client Information"
  const formatScreenName = (key: string) =>
    key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase()).trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            Portal Field Discovery
          </DialogTitle>
          <DialogDescription>
            Scan a carrier portal to capture all form fields, dropdowns, and buttons on every screen.
          </DialogDescription>
        </DialogHeader>

        {/* Carrier selection + start */}
        {status === "idle" || status === "error" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Carrier</label>
              <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a carrier to scan..." />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((c) => (
                    <SelectItem key={c.carrierId} value={c.carrierId}>
                      {c.carrierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Use Contact Data (for Client Search)</label>
              <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a real contact for search..." />
                </SelectTrigger>
                <SelectContent>
                  {(contacts ?? []).map((c: any) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.firstName} {c.lastName} {c.city ? `— ${c.city}, ${c.state}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-on-surface-variant">
                Uses this contact's real name, address, and zip for the NatGen client search instead of fake test data.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Discovery Mode</label>
              <Select value={discoveryAction} onValueChange={setDiscoveryAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashboard_only">Dashboard Only (debug — no interaction)</SelectItem>
                  <SelectItem value="login_only">Login Only</SelectItem>
                  <SelectItem value="client_search">Up to Client Search</SelectItem>
                  <SelectItem value="full_discovery">Full Discovery (all screens)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* 2FA Input */}
            {twoFaSessionId && (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="flex items-start gap-2 text-xs text-amber-600">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{twoFaMessage}</span>
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
                    Verify & Continue
                  </Button>
                </div>
              </div>
            )}

            {!twoFaSessionId && (
              <Button onClick={handleDiscover} disabled={!selectedCarrierId} className="w-full gap-2">
                <Compass className="h-4 w-4" />
                Start Discovery
              </Button>
            )}

            <p className="text-xs text-on-surface-variant">
              This will open a browser, log into the portal, and navigate every screen to capture form field data.
              The browser will be visible so you can watch the process. Takes 1-3 minutes.
            </p>
          </div>
        ) : status === "discovering" ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium">Scanning portal...</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Logging in → Navigating screens → Capturing fields
              </p>
            </div>
          </div>
        ) : (
          /* Results view */
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  {screenNames.length} screens discovered
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleCopyJson}>
                  {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied!" : "Copy JSON"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setStatus("idle"); setResults(null); }}
                >
                  Re-scan
                </Button>
              </div>
            </div>

            {/* Screen tabs */}
            <div className="flex gap-1 flex-wrap">
              {/* Pre-login screens */}
              {results?.loginPage && (
                <button
                  onClick={() => setActiveScreen("_login")}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${activeScreen === "_login" ? "bg-primary text-primary-foreground font-medium" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"}`}
                >
                  Login
                </button>
              )}
              {results?.clientSearchFields && (
                <button
                  onClick={() => setActiveScreen("_search")}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${activeScreen === "_search" ? "bg-primary text-primary-foreground font-medium" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"}`}
                >
                  Search
                </button>
              )}
              {results?.clientInfoFields && (
                <button
                  onClick={() => setActiveScreen("_clientInfo")}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${activeScreen === "_clientInfo" ? "bg-primary text-primary-foreground font-medium" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"}`}
                >
                  Client Info
                </button>
              )}
              {/* Sidebar-navigated screens */}
              {screenNames.map((name) => (
                <button
                  key={name}
                  onClick={() => setActiveScreen(name)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${activeScreen === name ? "bg-primary text-primary-foreground font-medium" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"}`}
                >
                  {formatScreenName(name)}
                </button>
              ))}
            </div>

            {/* Screen data */}
            <ScrollArea className="flex-1 min-h-0 rounded-lg border">
              <div className="p-3 space-y-3">
                {activeScreen === "_login" && results?.loginPage && (
                  <FieldTable title="Login Fields" fields={results.loginPage} expanded={expandedSections.has("inputs")} onToggle={() => toggleSection("inputs")} />
                )}
                {activeScreen === "_search" && results?.clientSearchFields && (
                  <FieldTable title="Search Fields" fields={results.clientSearchFields} expanded={expandedSections.has("inputs")} onToggle={() => toggleSection("inputs")} />
                )}
                {activeScreen === "_clientInfo" && (
                  <>
                    {results?.clientInfoFields && (
                      <FieldTable title="Input Fields" fields={results.clientInfoFields} expanded={expandedSections.has("inputs")} onToggle={() => toggleSection("inputs")} />
                    )}
                    {results?.clientInfoSelects && (
                      <SelectTable title="Dropdowns" selects={results.clientInfoSelects} expanded={expandedSections.has("selects")} onToggle={() => toggleSection("selects")} />
                    )}
                  </>
                )}
                {currentScreenData && (
                  <>
                    <div className="text-xs text-on-surface-variant mb-2">
                      URL: {currentScreenData.url}
                    </div>
                    {currentScreenData.inputs?.length > 0 && (
                      <FieldTable title="Input Fields" fields={currentScreenData.inputs} expanded={expandedSections.has("inputs")} onToggle={() => toggleSection("inputs")} />
                    )}
                    {currentScreenData.selects?.length > 0 && (
                      <SelectTable title="Dropdowns" selects={currentScreenData.selects} expanded={expandedSections.has("selects")} onToggle={() => toggleSection("selects")} />
                    )}
                    {currentScreenData.buttons?.length > 0 && (
                      <ButtonTable title="Buttons" buttons={currentScreenData.buttons} expanded={expandedSections.has("buttons")} onToggle={() => toggleSection("buttons")} />
                    )}
                  </>
                )}
                {/* Raw page data for debugging */}
                {results?.postLoginUrl && activeScreen === "" && (
                  <div className="space-y-3">
                    <div className="text-xs">
                      <span className="font-semibold">Post-login URL:</span>{" "}
                      <span className="font-mono text-on-surface-variant break-all">{results.postLoginUrl}</span>
                    </div>
                    {results.postLoginPageText && (
                      <div>
                        <span className="text-xs font-semibold">Page Text:</span>
                        <pre className="text-[10px] mt-1 p-2 bg-surface-container rounded max-h-[200px] overflow-auto whitespace-pre-wrap">{results.postLoginPageText}</pre>
                      </div>
                    )}
                    {results.dashboardFields && (
                      <FieldTable title="Dashboard Inputs" fields={results.dashboardFields} expanded={true} onToggle={() => {}} />
                    )}
                    {results.dashboardSelects && (
                      <SelectTable title="Dashboard Dropdowns" selects={results.dashboardSelects} expanded={true} onToggle={() => {}} />
                    )}
                    {results.dashboardButtons && (
                      <ButtonTable title="Dashboard Buttons" buttons={results.dashboardButtons} expanded={true} onToggle={() => {}} />
                    )}
                  </div>
                )}
                {!currentScreenData && !["_login", "_search", "_clientInfo"].includes(activeScreen) && !results?.postLoginUrl && (
                  <p className="text-sm text-on-surface-variant py-4 text-center">Select a screen tab above</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function SectionHeader({ title, count, expanded, onToggle }: { title: string; count: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-1.5 w-full text-left hover:bg-surface-container-high/30 rounded px-1 py-0.5 -mx-1">
      <ChevronRight className={`h-3 w-3 text-on-surface-variant transition-transform ${expanded ? "rotate-90" : ""}`} />
      <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{title}</span>
      <Badge variant="secondary" className="text-[9px] px-1 py-0">{count}</Badge>
    </button>
  );
}

function FieldTable({ title, fields, expanded, onToggle }: { title: string; fields: any[]; expanded: boolean; onToggle: () => void }) {
  const visible = fields.filter((f: any) => f.visible);
  return (
    <div>
      <SectionHeader title={title} count={visible.length} expanded={expanded} onToggle={onToggle} />
      {expanded && (
        <div className="mt-1.5 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b text-on-surface-variant">
                <th className="text-left py-1 px-1.5 font-medium">Name</th>
                <th className="text-left py-1 px-1.5 font-medium">ID</th>
                <th className="text-left py-1 px-1.5 font-medium">Type</th>
                <th className="text-left py-1 px-1.5 font-medium">Label</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f: any, i: number) => (
                <tr key={i} className="border-b border-border/30 hover:bg-surface-container-high/20">
                  <td className="py-1 px-1.5 font-mono text-[10px]">{f.name || "—"}</td>
                  <td className="py-1 px-1.5 font-mono text-[10px] text-on-surface-variant">{f.id || "—"}</td>
                  <td className="py-1 px-1.5">
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{f.type}</Badge>
                  </td>
                  <td className="py-1 px-1.5 text-on-surface-variant truncate max-w-[150px]">{f.label || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SelectTable({ title, selects, expanded, onToggle }: { title: string; selects: any[]; expanded: boolean; onToggle: () => void }) {
  const visible = selects.filter((s: any) => s.visible);
  return (
    <div>
      <SectionHeader title={title} count={visible.length} expanded={expanded} onToggle={onToggle} />
      {expanded && (
        <div className="mt-1.5 space-y-2">
          {visible.map((s: any, i: number) => (
            <div key={i} className="rounded border bg-surface-container/20 p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[10px] font-medium">{s.name || s.id || "unnamed"}</span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">{s.optionCount} options</Badge>
                {s.label && <span className="text-[10px] text-on-surface-variant">({s.label})</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {(s.options || []).slice(0, 8).map((o: any, j: number) => (
                  <span key={j} className="text-[9px] bg-background rounded border px-1 py-0.5">
                    {o.text || o.value}
                  </span>
                ))}
                {(s.options?.length || 0) > 8 && (
                  <span className="text-[9px] text-on-surface-variant">+{s.options.length - 8} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ButtonTable({ title, buttons, expanded, onToggle }: { title: string; buttons: any[]; expanded: boolean; onToggle: () => void }) {
  return (
    <div>
      <SectionHeader title={title} count={buttons.length} expanded={expanded} onToggle={onToggle} />
      {expanded && (
        <div className="mt-1.5 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b text-on-surface-variant">
                <th className="text-left py-1 px-1.5 font-medium">Text/Value</th>
                <th className="text-left py-1 px-1.5 font-medium">ID</th>
                <th className="text-left py-1 px-1.5 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {buttons.map((b: any, i: number) => (
                <tr key={i} className="border-b border-border/30 hover:bg-surface-container-high/20">
                  <td className="py-1 px-1.5 font-medium">{b.text || b.value || "—"}</td>
                  <td className="py-1 px-1.5 font-mono text-[10px] text-on-surface-variant">{b.id || "—"}</td>
                  <td className="py-1 px-1.5">
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{b.tag}/{b.type || "link"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
