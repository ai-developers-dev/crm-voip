"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
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
import { Loader2, Target, Copy, CheckCircle, AlertCircle, ShieldCheck, Square } from "lucide-react";

interface FieldMapperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  carriers: Array<{ carrierId: string; carrierName: string }>;
}

interface CapturedField {
  tag: string;
  id: string | null;
  name: string | null;
  type: string;
  label: string | null;
  selector: string | null;
  selectedValue?: string | null;
  selectedText?: string | null;
  options?: Array<{ value: string; text: string }>;
  screen: string;
  capturedAt: string;
  contactField?: string; // auto-mapped contact field
}

// Auto-mapping: label patterns → contact field names
const CONTACT_FIELD_MAP: Record<string, string> = {
  "first name": "firstName",
  "last name": "lastName",
  "middle name": "middleName",
  "date of birth": "dateOfBirth",
  "dob": "dateOfBirth",
  "zip code": "zipCode",
  "zip": "zipCode",
  "city": "city",
  "state": "state",
  "street address 1": "address",
  "street address": "address",
  "address": "address",
  "street address 2": "address2",
  "email address": "email",
  "confirm email address": "email",
  "confirm email": "email",
  "phone": "phone",
  "area code": "phoneAreaCode",
  "prefix": "phonePrefix",
  "line number": "phoneLineNumber",
  "gender": "gender",
  "marital status": "maritalStatus",
  "occupation": "occupation",
  "social security": "ssn",
  "policy effective date": "auto.effectiveDate",
};

// Fallback: match by element ID patterns when label is missing or unhelpful
const ID_FIELD_MAP: Record<string, string> = {
  "txtareacode": "phoneAreaCode",
  "txtprefix": "phonePrefix",
  "txtlinenumber": "phoneLineNumber",
  "txtextension": "phoneExtension",
  "txtfirstname": "firstName",
  "txtlastname": "lastName",
  "txtmiddlename": "middleName",
  "txtdateofbirth": "dateOfBirth",
  "txtemailaddress": "email",
  "txtemailaddressconfirmation": "email",
  "txtaddress": "address",
  "txtaddress2": "address2",
  "txtcity": "city",
  "txtzipcode": "zipCode",
  "txtzip4": "zipPlus4",
  "txtssn": "ssn",
  "txtpolicyeffdate": "auto.effectiveDate",
  "txtagent": "auto.agentCode",
  "ddlgender": "gender",
  "ddlmaritalstatus": "maritalStatus",
  "ddloccupation": "occupation",
  "ddlphonetype": "phoneType",
  "ddlstate": "state",
  "ddlsuffix": "suffix",
};

function autoMapField(label: string | null, id?: string | null): string | undefined {
  // Try label first
  if (label) {
    const lower = label.toLowerCase().trim();
    if (CONTACT_FIELD_MAP[lower]) return CONTACT_FIELD_MAP[lower];
  }

  // Fallback: match by element ID suffix
  if (id) {
    const idLower = id.toLowerCase();
    for (const [pattern, field] of Object.entries(ID_FIELD_MAP)) {
      if (idLower.endsWith(pattern)) return field;
    }
  }

  return undefined;
}

type Status = "idle" | "starting" | "active" | "error" | "needs_2fa" | "saving";

export function FieldMapperDialog({
  open,
  onOpenChange,
  organizationId,
  carriers,
}: FieldMapperDialogProps) {
  const [selectedCarrierId, setSelectedCarrierId] = useState("");
  const [selectedQuoteType, setSelectedQuoteType] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captures, setCaptures] = useState<CapturedField[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [currentUrl, setCurrentUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaMessage, setTwoFaMessage] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch lines of business for the selected carrier
  const products = useQuery(
    api.agencyProducts.getByCarrier,
    selectedCarrierId ? { carrierId: selectedCarrierId as Id<"agencyCarriers"> } : "skip"
  );
  const activeProducts = (products ?? []).filter((p: any) => p.isActive);

  const saveMapping = useMutation(api.portalFieldMappings.save);
  const [saved, setSaved] = useState(false);

  // Reset quote type when carrier changes
  useEffect(() => {
    setSelectedQuoteType("");
  }, [selectedCarrierId]);

  // Auto-map contact fields when captures update
  useEffect(() => {
    setCaptures((prev) =>
      prev.map((c) => ({
        ...c,
        contactField: c.contactField || autoMapField(c.label, c.id),
      }))
    );
  }, [captures.length]);

  // Poll for captures while mapper is active
  useEffect(() => {
    if (status === "active" && sessionId) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch("/api/portal-test/field-mapper", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get_captures", sessionId }),
          });
          const data = await res.json();
          if (data.captures) {
            setCaptures(data.captures);
            setCurrentUrl(data.currentUrl || "");
          }
          if (data.sources) {
            setSources(data.sources);
          }
        } catch {}
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, sessionId]);

  // Cleanup on close
  useEffect(() => {
    if (!open && sessionId) {
      fetch("/api/portal-test/field-mapper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", sessionId }),
      }).catch(() => {});
      setSessionId(null);
      setStatus("idle");
    }
  }, [open]);

  const handleStart = async () => {
    if (!selectedCarrierId) return;
    setStatus("starting");
    setError(null);
    setCaptures([]);

    try {
      const res = await fetch("/api/portal-test/field-mapper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", organizationId, carrierId: selectedCarrierId, quoteType: selectedQuoteType }),
        credentials: "include",
      });
      const data = await res.json();

      if (data.status === "needs_2fa") {
        setStatus("needs_2fa");
        setSessionId(data.sessionId);
        setTwoFaMessage(data.message || "Enter verification code");
        return;
      }

      if (data.error) {
        setStatus("error");
        setError(data.error);
        return;
      }

      setSessionId(data.sessionId);
      setStatus("active");
    } catch (err: any) {
      setStatus("error");
      setError(err.message);
    }
  };

  const handle2faSubmit = async () => {
    if (!sessionId || !twoFaCode.trim()) return;
    setStatus("starting");
    try {
      const res = await fetch("/api/portal-test/field-mapper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume_2fa", sessionId, code: twoFaCode.trim() }),
      });
      const data = await res.json();

      if (data.status === "started") {
        setSessionId(data.sessionId);
        setStatus("active");
        setTwoFaCode("");
      } else {
        setStatus("error");
        setError(data.error || data.message || "2FA failed");
      }
    } catch (err: any) {
      setStatus("error");
      setError(err.message);
    }
  };

  const handleStop = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch("/api/portal-test/field-mapper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", sessionId }),
      });
      const data = await res.json();
      if (data.captures) setCaptures(data.captures);
    } catch {}
    setSessionId(null);
    setStatus("idle");
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(captures, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateField = (index: number, updates: Partial<CapturedField>) => {
    setCaptures((prev) => prev.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  const handleDeleteField = (index: number) => {
    setCaptures((prev) => prev.filter((_, i) => i !== index));
  };

  /** Auto-enrich screens with actions, nextButton, transforms based on field patterns */
  function autoEnrichScreens(rawScreens: any[]): { screens: any[]; log: string[] } {
    const log: string[] = [];

    const screens = rawScreens.map((screen, i) => {
      const enriched = { ...screen, fields: [...screen.fields] };
      const fields = enriched.fields;

      // ── Auto-detect nextButton ──────────────────────────────────
      const nextBtn = fields.find((f: any) =>
        (f.type === "button" || f.type === "submit") &&
        (f.label?.toLowerCase().includes("next") ||
         f.label?.toLowerCase().includes("continue") ||
         f.id?.toLowerCase().includes("btncontinue") ||
         f.id?.toLowerCase().includes("btnsubmit"))
      );
      if (nextBtn && !enriched.nextButton) {
        enriched.nextButton = nextBtn.selector;
        log.push(`Screen "${screen.name}": Next button → ${nextBtn.selector}`);
      }

      // ── Auto-detect search button ──────────────────────────────
      const searchBtn = fields.find((f: any) =>
        (f.type === "button" || f.type === "submit") &&
        (f.label?.toLowerCase().includes("search") ||
         f.id?.toLowerCase().includes("btnsearch"))
      );

      // ── Auto-detect screen action ──────────────────────────────
      if (!enriched.action) {
        const hasDriverStatus = fields.some((f: any) =>
          f.id?.toLowerCase().includes("driverstatus") ||
          f.name?.toLowerCase().includes("driverstatus"));
        const hasVehicleRadios = fields.some((f: any) =>
          f.id?.toLowerCase().includes("rbaccept") ||
          f.id?.toLowerCase().includes("rbreject"));
        const hasCoverageDropdowns = fields.some((f: any) =>
          f.label?.toLowerCase().includes("bodily injury") ||
          f.label?.toLowerCase().includes("deductible") ||
          f.id?.toLowerCase().includes("coverage"));
        const hasAddNewCustomer = fields.some((f: any) =>
          f.id?.toLowerCase().includes("btnaddnewclient") ||
          f.id?.toLowerCase().includes("addnewcustomer") ||
          f.label?.toLowerCase().includes("add new customer"));
        const inputFields = fields.filter((f: any) =>
          f.type !== "button" && f.type !== "submit" && f.tag !== "a");
        const hasMultipleInputs = inputFields.length >= 5;
        const isLastScreen = i === rawScreens.length - 1;

        if (hasDriverStatus || hasVehicleRadios) {
          enriched.action = "reject_all_drivers";
          log.push(`Screen "${screen.name}": Action → reject_all_drivers (has driver/vehicle fields)`);
        } else if (hasCoverageDropdowns) {
          enriched.action = "select_standard_coverages";
          log.push(`Screen "${screen.name}": Action → select_standard_coverages`);
        } else if (hasAddNewCustomer) {
          enriched.action = "click_add_new_customer";
          log.push(`Screen "${screen.name}": Action → click_add_new_customer`);
          // Override nextButton to use Add New Customer instead of Search
          enriched.nextButton = fields.find((f: any) =>
            f.id?.toLowerCase().includes("btnaddnewclient"))?.selector || enriched.nextButton;
        } else if (isLastScreen) {
          enriched.action = "scrape_premium";
          log.push(`Screen "${screen.name}": Action → scrape_premium (last screen)`);
        } else if (hasMultipleInputs) {
          enriched.action = "fill_batch";
          log.push(`Screen "${screen.name}": Action → fill_batch (${inputFields.length} fields)`);
        } else if (searchBtn && inputFields.length <= 4) {
          // Search screen — fill fields, click search button (not Next)
          enriched.nextButton = searchBtn.selector;
          log.push(`Screen "${screen.name}": Search screen → button = ${searchBtn.selector}`);
        }
      }

      // ── Auto-detect transforms per field ────────────────────────
      enriched.fields = fields.map((f: any) => {
        const enrichedField = { ...f };
        if (!enrichedField.transform) {
          if (f.contactField === "dateOfBirth" ||
              f.label?.toLowerCase().includes("date of birth") ||
              f.id?.toLowerCase().includes("dateofbirth") ||
              f.id?.toLowerCase().includes("dob")) {
            enrichedField.transform = "formatDob";
            log.push(`Field "${f.label || f.id}": Transform → formatDob`);
          }
        }
        return enrichedField;
      });

      return enriched;
    });

    return { screens, log };
  }

  const [enrichLog, setEnrichLog] = useState<string[]>([]);

  const handleSave = async () => {
    if (!selectedCarrierId || !selectedQuoteType || captures.length === 0) return;
    setSaved(false);
    setStatus("saving");

    try {
      // Group captures into screens with order
      const screenOrder: string[] = [];
      for (const c of captures) {
        if (!screenOrder.includes(c.screen)) screenOrder.push(c.screen);
      }

      const rawScreens = screenOrder.map((name, i) => {
        const sourceData = sources[name];
        const url = typeof sourceData === "object" && sourceData ? (sourceData as any).url : undefined;
        return {
          name,
          order: i,
          url,
          fields: captures
            .filter((c) => c.screen === name)
            .map((c) => ({
              selector: c.selector || "",
              tag: c.tag,
              type: c.type,
              label: c.label || undefined,
              id: c.id || undefined,
              name: c.name || undefined,
              contactField: c.contactField || autoMapField(c.label, c.id) || undefined,
              selectedValue: c.selectedValue || undefined,
              options: c.options,
            })),
        };
      });

      // Auto-enrich screens with actions, nextButton, transforms
      const { screens, log } = autoEnrichScreens(rawScreens);
      setEnrichLog(log);
      console.log("[save] Auto-enrichment:", log);

      // Build separate sources array for the portalPageSources table
      const sourcesArray = Object.entries(sources)
        .filter(([_, data]) => data && (typeof data === "string" ? data : (data as any)?.html))
        .map(([screenName, data], i) => ({
          screenName,
          screenOrder: screenOrder.indexOf(screenName) >= 0 ? screenOrder.indexOf(screenName) : i,
          pageSource: typeof data === "string" ? data : (data as any)?.html || "",
          url: typeof data === "object" && data ? (data as any)?.url : undefined,
        }));

      await saveMapping({
        carrierId: selectedCarrierId as Id<"agencyCarriers">,
        quoteType: selectedQuoteType,
        screens,
        sources: sourcesArray.length > 0 ? sourcesArray : undefined,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
      setStatus("idle");
    } catch (err: any) {
      setStatus("error");
      setError("Failed to save: " + err.message);
    }
  };

  // Group captures by screen
  const capturesByScreen = captures.reduce((acc, c) => {
    const screen = c.screen || "unknown";
    if (!acc[screen]) acc[screen] = [];
    acc[screen].push(c);
    return acc;
  }, {} as Record<string, CapturedField[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Interactive Field Mapper
          </DialogTitle>
          <DialogDescription>
            Opens the portal in a browser. Click on fields to capture their selectors. Toggle between Capture and Navigate modes.
          </DialogDescription>
        </DialogHeader>

        {/* Idle / Error state */}
        {(status === "idle" || status === "error") && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Carrier</label>
              <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose carrier..." />
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

            {/* Quote Type / Line of Business */}
            {selectedCarrierId && activeProducts.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Quote Type</label>
                <Select value={selectedQuoteType} onValueChange={setSelectedQuoteType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose quote type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProducts.map((p: any) => (
                      <SelectItem key={p._id} value={p.name.toLowerCase()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedCarrierId && activeProducts.length === 0 && products !== undefined && (
              <p className="text-xs text-amber-600">
                No lines of business configured for this carrier. Add them in Platform Settings → Products.
              </p>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button onClick={handleStart} disabled={!selectedCarrierId || !selectedQuoteType} className="w-full gap-2">
              <Target className="h-4 w-4" />
              Start Field Mapper — {selectedQuoteType || "select quote type"}
            </Button>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>1. Browser opens and logs into the carrier portal</p>
              <p>2. A floating "Field Mapper" panel appears on the portal page</p>
              <p>3. <b>Capture Mode:</b> Hover highlights fields, click records the selector</p>
              <p>4. <b>Navigate Mode:</b> Fill forms normally, click Next to advance</p>
              <p>5. Captured fields appear below. Copy JSON when done.</p>
            </div>

            {/* Show previous captures if any */}
            {captures.length > 0 && (
              <>
                {saved && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-2 text-sm text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    Mappings saved to database!
                  </div>
                )}
                <Button onClick={handleSave} disabled={!selectedQuoteType} className="w-full gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Save {captures.length} Field Mappings
                </Button>
                <CaptureResults
                  capturesByScreen={capturesByScreen}
                  total={captures.length}
                  onCopy={handleCopy}
                  copied={copied}
                  onUpdateField={handleUpdateField}
                  onDeleteField={handleDeleteField}
                  sources={sources}
                />
              </>
            )}
          </div>
        )}

        {/* 2FA */}
        {status === "needs_2fa" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-sm text-amber-600">{twoFaMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Enter verification code"
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handle2faSubmit(); }}
                className="flex-1"
                autoFocus
              />
              <Button onClick={handle2faSubmit} disabled={!twoFaCode.trim()}>Verify</Button>
            </div>
          </div>
        )}

        {/* Starting */}
        {status === "starting" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Opening browser and logging in...</p>
          </div>
        )}

        {/* Saving */}
        {status === "saving" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Saving field mappings...</p>
          </div>
        )}

        {/* Active — show live captures */}
        {status === "active" && (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium text-green-700">Browser is open — click fields in the portal</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleStop} className="gap-1.5 text-xs">
                  <Square className="h-3 w-3" />
                  Stop
                </Button>
                <Button size="sm" onClick={handleSave} disabled={captures.length === 0} className="gap-1.5 text-xs">
                  <CheckCircle className="h-3 w-3" />
                  Done — Save Mappings
                </Button>
              </div>
            </div>

            {currentUrl && (
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                {currentUrl}
              </div>
            )}

            {/* Source auto-capture indicator */}
            <div className="flex items-center justify-between rounded border border-purple-500/30 bg-purple-500/10 px-2 py-1.5">
              <span className="text-[10px] text-purple-600">
                📄 Auto-capturing source on every screen — {Object.keys(sources).length} screen{Object.keys(sources).length !== 1 ? "s" : ""} captured
                {Object.keys(sources).length > 0 && (
                  <span className="text-muted-foreground"> ({Object.keys(sources).join(", ")})</span>
                )}
              </span>
              {Object.keys(sources).length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-purple-600 border-purple-500/30"
                  onClick={async () => {
                    // Extract just HTML for clipboard (strip metadata)
                    const htmlOnly: Record<string, string> = {};
                    for (const [name, data] of Object.entries(sources)) {
                      htmlOnly[name] = typeof data === "string" ? data : (data as any)?.html || "";
                    }
                    await navigator.clipboard.writeText(JSON.stringify(htmlOnly, null, 2));
                    alert("Page source HTML copied to clipboard!");
                  }}
                >
                  <Copy className="h-3 w-3" />
                  Copy Source
                </Button>
              )}
            </div>

            {saved && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-2 space-y-1">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  Mappings saved! Auto-enrichment applied:
                </div>
                {enrichLog.length > 0 && (
                  <div className="text-[10px] text-green-600 space-y-0.5 ml-6">
                    {enrichLog.map((line, i) => (
                      <div key={i}>• {line}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <CaptureResults
              capturesByScreen={capturesByScreen}
              total={captures.length}
              onCopy={handleCopy}
              copied={copied}
              onUpdateField={handleUpdateField}
              onDeleteField={handleDeleteField}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Data source options (shared with platform-field-mapper) ─────────────

const DATA_SOURCES = [
  { group: "Contact", options: [
    { value: "firstName", label: "First Name" },
    { value: "lastName", label: "Last Name" },
    { value: "middleName", label: "Middle Name" },
    { value: "dateOfBirth", label: "Date of Birth" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone (full)" },
    { value: "phoneAreaCode", label: "Phone (area code)" },
    { value: "phonePrefix", label: "Phone (prefix)" },
    { value: "phoneLineNumber", label: "Phone (line)" },
    { value: "address", label: "Street Address" },
    { value: "address2", label: "Street Address 2" },
    { value: "city", label: "City" },
    { value: "state", label: "State" },
    { value: "zipCode", label: "Zip Code" },
    { value: "ssn", label: "SSN" },
  ]},
  { group: "Lead", options: [
    { value: "lead.dob", label: "Date of Birth" },
    { value: "lead.address", label: "Street Address" },
    { value: "lead.city", label: "City" },
    { value: "lead.state", label: "State" },
    { value: "lead.zip", label: "Zip Code" },
  ]},
  { group: "Auto", options: [
    { value: "auto.effectiveDate", label: "Today's Date" },
    { value: "auto.agentCode", label: "Agent Code" },
  ]},
];

const SOURCE_LABEL: Record<string, string> = {};
DATA_SOURCES.forEach((g) => g.options.forEach((o) => {
  SOURCE_LABEL[o.value] = `${g.group} → ${o.label}`;
}));

// Convert raw NatGen ASP.NET IDs into readable names
const ID_LABEL_MAP: Record<string, string> = {
  btnaddnewclient: "Add New Customer (button)",
  btncontinue: "Next / Continue (button)",
  btnprevious: "Previous (button)",
  btnsearch: "Search (button)",
  btnclose: "Close (button)",
  btnsave: "Save (button)",
};

function humanLabel(field: CapturedField): string {
  if (field.label && field.label !== "-" && !field.label.startsWith("MainContent_") && !field.label.startsWith("ctl00")) {
    return field.label;
  }
  if (field.id) {
    const idLower = field.id.toLowerCase();
    for (const [pattern, name] of Object.entries(ID_LABEL_MAP)) {
      if (idLower.endsWith(pattern)) return name;
    }
    const parts = field.id.split("_");
    const last = parts[parts.length - 1];
    const cleaned = last.replace(/^(txt|ddl|btn|chk|lbl|uc)/, "");
    if (cleaned) return cleaned.replace(/([A-Z])/g, " $1").trim();
  }
  return field.label || field.id || "(unlabeled)";
}

// ── Sub-component: Editable Capture Results ─────────────────────────────

function CaptureResults({
  capturesByScreen,
  total,
  onCopy,
  copied,
  onUpdateField,
  onDeleteField,
  sources,
}: {
  capturesByScreen: Record<string, CapturedField[]>;
  total: number;
  onCopy: () => void;
  copied: boolean;
  onUpdateField?: (index: number, updates: Partial<CapturedField>) => void;
  onDeleteField?: (index: number) => void;
  sources?: Record<string, string>;
}) {
  // Build a flat index map so we can map screen+fieldIndex back to captures array index
  let flatIndex = 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{total} fields captured</span>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onCopy}>
          {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied!" : "Copy JSON"}
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 max-h-[400px] rounded-lg border">
        <div className="p-3 space-y-3">
          {Object.entries(capturesByScreen).map(([screen, fields]) => {
            const screenStartIndex = flatIndex;
            flatIndex += fields.length;
            return (
              <ScreenWithSource key={screen} screen={screen} hasSource={!!sources?.[screen]}>
                <div className="space-y-1.5">
                  {fields.map((f, fi) => {
                    const idx = screenStartIndex + fi;
                    return (
                      <LiveEditFieldRow
                        key={`${idx}-${f.selector}`}
                        field={f}
                        onUpdate={onUpdateField ? (updates) => onUpdateField(idx, updates) : undefined}
                        onDelete={onDeleteField ? () => onDeleteField(idx) : undefined}
                      />
                    );
                  })}
                </div>
              </ScreenWithSource>
            );
          })}
          {total === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No fields captured yet. Click on form fields in the portal browser.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Inline editable field row (used during live capture) ────────────────

// ── Screen header with optional source badge ────────────────────────────

function ScreenWithSource({
  screen,
  hasSource,
  children,
}: {
  screen: string;
  hasSource: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        {screen}
        {hasSource && (
          <span className="text-purple-500 normal-case font-normal">📄 source captured</span>
        )}
      </div>
      {children}
    </div>
  );
}

// Also update the source indicator in the active mapper to show a Copy Source button


// ── Inline editable field row (used during live capture) ────────────────

function LiveEditFieldRow({
  field,
  onUpdate,
  onDelete,
}: {
  field: CapturedField;
  onUpdate?: (updates: Partial<CapturedField>) => void;
  onDelete?: () => void;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const isSelect = field.tag === "select";
  const isButton = field.type === "submit" || field.type === "button";
  const displayLabel = humanLabel(field);
  const mapped = field.contactField || autoMapField(field.label, field.id);

  const borderColor = isButton ? "#2196F3" : isSelect ? "#FF9800" : "#4CAF50";

  // Current source type
  const sourceType = field.contactField?.startsWith("lead.") ? "lead"
    : field.contactField?.startsWith("auto.") ? "auto"
    : field.contactField ? "contact"
    : "unmapped";
  const sourceValue = field.contactField || "";

  return (
    <div
      className="rounded border bg-card p-2 space-y-1"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      {/* Label row */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {editingLabel && onUpdate ? (
            <Input
              autoFocus
              defaultValue={field.label || displayLabel}
              onBlur={(e) => { onUpdate({ label: e.target.value }); setEditingLabel(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { onUpdate({ label: (e.target as HTMLInputElement).value }); setEditingLabel(false); } }}
              className="h-6 text-xs w-48"
            />
          ) : (
            <span
              className={`text-xs font-medium truncate ${onUpdate ? "cursor-pointer hover:underline" : ""}`}
              onClick={() => onUpdate && setEditingLabel(true)}
              title={onUpdate ? "Click to edit label" : undefined}
            >
              {displayLabel}
            </span>
          )}
          <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">
            {isButton ? "button" : field.tag}
          </Badge>
          {mapped && !isButton && (
            <Badge className="text-[8px] px-1 py-0 bg-blue-500/10 text-blue-600 border-blue-500/30 shrink-0">
              → {SOURCE_LABEL[mapped] || mapped}
            </Badge>
          )}
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded shrink-0"
            title="Remove field"
          >
            <AlertCircle className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Selector */}
      <div className="font-mono text-[9px] text-green-600 truncate">{field.selector}</div>

      {/* Controls */}
      {isButton ? (
        <div className="text-[9px] text-blue-600">Action: Click to advance</div>
      ) : onUpdate ? (
        <div className="flex items-center gap-2">
          {isSelect && field.options?.length ? (
            <select
              value={field.selectedValue || ""}
              onChange={(e) => onUpdate({ selectedValue: e.target.value } as any)}
              className="flex-1 h-6 text-[10px] rounded border bg-background px-1"
            >
              <option value="">-- Select value --</option>
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>{o.text}</option>
              ))}
            </select>
          ) : (
            <select
              value={sourceValue || "unmapped"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "unmapped") onUpdate({ contactField: undefined } as any);
                else onUpdate({ contactField: val } as any);
              }}
              className="flex-1 h-6 text-[10px] rounded border bg-background px-1"
            >
              <option value="unmapped">-- Select source --</option>
              {DATA_SOURCES.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      ) : (
        /* Read-only summary for non-editable mode */
        <>
          {field.selectedValue && (
            <div className="text-[9px] text-purple-500">
              Selected: {field.selectedText || field.options?.find((o) => o.value === field.selectedValue)?.text || field.selectedValue}
            </div>
          )}
        </>
      )}
    </div>
  );
}
