"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Target, ChevronRight, Database, List, FileText, MapPin, X, Save, Trash2, Loader2, Code } from "lucide-react";
import { FieldMapperDialog } from "@/components/settings/field-mapper-dialog";

// Data source options grouped by table
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
    { value: "lead.email", label: "Email" },
    { value: "lead.phone", label: "Phone" },
  ]},
  { group: "Auto", options: [
    { value: "auto.effectiveDate", label: "Today's Date" },
    { value: "auto.agentCode", label: "Agent Code" },
  ]},
];

// Flat lookup for display
const SOURCE_LABEL: Record<string, string> = {};
DATA_SOURCES.forEach((g) => g.options.forEach((o) => {
  SOURCE_LABEL[o.value] = `${g.group} → ${o.label}`;
}));

export function PlatformFieldMapper() {
  const [selectedCarrierId, setSelectedCarrierId] = useState("");
  const [isMapperOpen, setIsMapperOpen] = useState(false);
  const [viewMapping, setViewMapping] = useState<any>(null);

  // Platform-level carriers
  const allCarriers = useQuery(api.agencyCarriers.getAll);
  const tenants = useQuery(api.organizations.getAllTenants);

  // All saved field mappings — fetch for each active carrier
  const activeCarriers = (allCarriers ?? []).filter((c: any) => c.isActive);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-on-surface-variant">
        Opens a carrier portal in a visible browser. Click on form fields to capture their CSS selectors for quote automation.
        Portal fields are the same for all organizations using a carrier — credentials are auto-detected.
      </p>

      {/* Select Carrier + Start Mapper */}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs font-semibold">Carrier Portal</Label>
          <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select a carrier to map..." />
            </SelectTrigger>
            <SelectContent>
              {activeCarriers.map((c: any) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedCarrierId && (
          <Button size="sm" onClick={() => setIsMapperOpen(true)} className="gap-2 shrink-0">
            <Target className="h-4 w-4" />
            Map Fields
          </Button>
        )}
      </div>

      {/* Saved Mappings Cards */}
      <SavedMappingsList
        carriers={activeCarriers}
        onView={setViewMapping}
      />

      {/* Mapper Dialog */}
      <CarrierMapperBridge
        open={isMapperOpen}
        onOpenChange={setIsMapperOpen}
        carrierId={selectedCarrierId}
        carrierName={activeCarriers.find((c: any) => c._id === selectedCarrierId)?.name ?? ""}
      />

      {/* View Mapping Detail Dialog */}
      {viewMapping && (
        <MappingDetailDialog
          open={!!viewMapping}
          onOpenChange={(open) => { if (!open) setViewMapping(null); }}
          mapping={viewMapping.mapping}
          carrierName={viewMapping.carrierName}
        />
      )}
    </div>
  );
}

// ── Saved Mappings List ─────────────────────────────────────────────────

function SavedMappingsList({
  carriers,
  onView,
}: {
  carriers: any[];
  onView: (data: { mapping: any; carrierName: string }) => void;
}) {
  // Query mappings for each carrier (up to 5)
  const c0 = carriers[0]?._id;
  const c1 = carriers[1]?._id;
  const c2 = carriers[2]?._id;
  const c3 = carriers[3]?._id;
  const c4 = carriers[4]?._id;

  const m0 = useQuery(api.portalFieldMappings.getByCarrier, c0 ? { carrierId: c0 } : "skip");
  const m1 = useQuery(api.portalFieldMappings.getByCarrier, c1 ? { carrierId: c1 } : "skip");
  const m2 = useQuery(api.portalFieldMappings.getByCarrier, c2 ? { carrierId: c2 } : "skip");
  const m3 = useQuery(api.portalFieldMappings.getByCarrier, c3 ? { carrierId: c3 } : "skip");
  const m4 = useQuery(api.portalFieldMappings.getByCarrier, c4 ? { carrierId: c4 } : "skip");

  const allMappings = useMemo(() => {
    const results: Array<{ mapping: any; carrierName: string }> = [];
    const checks = [
      { carrierId: c0, mappings: m0 },
      { carrierId: c1, mappings: m1 },
      { carrierId: c2, mappings: m2 },
      { carrierId: c3, mappings: m3 },
      { carrierId: c4, mappings: m4 },
    ];

    for (const check of checks) {
      if (!check.carrierId || !check.mappings) continue;
      const carrier = carriers.find((c: any) => c._id === check.carrierId);
      for (const mapping of check.mappings) {
        results.push({ mapping, carrierName: carrier?.name || "Unknown" });
      }
    }
    return results;
  }, [carriers, c0, c1, c2, c3, c4, m0, m1, m2, m3, m4]);

  if (allMappings.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-on-surface-variant">Saved Field Mappings</Label>
      <div className="space-y-1">
        {allMappings.map(({ mapping, carrierName }) => {
          const totalFields = mapping.screens.reduce((sum: number, s: any) => sum + s.fields.length, 0);
          return (
            <button
              key={mapping._id}
              onClick={() => onView({ mapping, carrierName })}
              className="w-full flex items-center justify-between rounded-md border bg-card px-3 py-2 text-left hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs font-medium truncate">{carrierName}</span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                  {mapping.quoteType}
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-on-surface-variant">
                  {mapping.screens.length} screens · {totalFields} fields
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Mapping Edit Dialog ──────────────────────────────────────────────────

function MappingDetailDialog({
  open,
  onOpenChange,
  mapping,
  carrierName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapping: any;
  carrierName: string;
}) {
  const updateFields = useMutation(api.portalFieldMappings.updateFields);
  const removeMapping = useMutation(api.portalFieldMappings.remove);

  // Fetch page sources for this mapping
  const pageSources = useQuery(api.portalFieldMappings.getSourcesForMapping, {
    mappingId: mapping._id,
  });
  // Build lookup: screenName → pageSource HTML
  const sourcesByScreen = useMemo(() => {
    const map: Record<string, string> = {};
    if (pageSources) {
      for (const s of pageSources) {
        map[s.screenName] = s.pageSource;
      }
    }
    return map;
  }, [pageSources]);

  const [editScreens, setEditScreens] = useState<any[]>(() =>
    JSON.parse(JSON.stringify(mapping.screens))
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const totalFields = editScreens.reduce((sum: number, s: any) => sum + s.fields.length, 0);

  // Update a field property
  const updateField = useCallback((si: number, fi: number, updates: Record<string, any>) => {
    setEditScreens((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      Object.assign(next[si].fields[fi], updates);
      return next;
    });
    setIsDirty(true);
  }, []);

  // Delete a field
  const deleteField = useCallback((si: number, fi: number) => {
    setEditScreens((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next[si].fields.splice(fi, 1);
      // Remove empty screens
      return next.filter((s: any) => s.fields.length > 0);
    });
    setIsDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateFields({
        mappingId: mapping._id as Id<"portalFieldMappings">,
        screens: editScreens,
      });
      setIsDirty(false);
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete all ${mapping.quoteType} field mappings for ${carrierName}?`)) return;
    setDeleting(true);
    try {
      await removeMapping({ mappingId: mapping._id as Id<"portalFieldMappings"> });
      onOpenChange(false);
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setDeleting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {carrierName} — {mapping.quoteType}
          </DialogTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-on-surface-variant">
              <span>{editScreens.length} screens</span>
              <span>{totalFields} fields</span>
              <span>Updated {new Date(mapping.updatedAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Delete All
              </Button>
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={handleSave}
                disabled={!isDirty || saving}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {isDirty ? "Save Changes" : "Saved"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {editScreens
              .sort((a: any, b: any) => a.order - b.order)
              .map((screen: any, si: number) => (
                <ScreenSection key={si} screen={screen} si={si} updateField={updateField} deleteField={deleteField} pageSource={sourcesByScreen[screen.name]} />
              ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Screen Section (with View Source toggle) ────────────────────────────

function ScreenSection({
  screen,
  si,
  updateField,
  deleteField,
  pageSource,
}: {
  screen: any;
  si: number;
  updateField: (si: number, fi: number, updates: Record<string, any>) => void;
  deleteField: (si: number, fi: number) => void;
  pageSource?: string;
}) {
  const [showSource, setShowSource] = useState(false);
  // Use pageSource from DB, falling back to screen.pageSource (legacy)
  const sourceHtml = pageSource || screen.pageSource;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Badge className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
          Screen {si + 1}
        </Badge>
        <span className="text-xs font-semibold">{screen.name}</span>
        <span className="text-[10px] text-on-surface-variant">({screen.fields.length})</span>
        {sourceHtml && (
          <button
            onClick={() => setShowSource(!showSource)}
            className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 transition-colors"
          >
            <Code className="h-3 w-3" />
            {showSource ? "Hide Source" : "View Source"}
          </button>
        )}
        {!sourceHtml && (
          <span className="text-[9px] text-on-surface-variant italic">no source</span>
        )}
      </div>

      {showSource && sourceHtml && (
        <div className="ml-2 mb-2 rounded border bg-zinc-950 text-green-400 p-3 max-h-[300px] overflow-auto">
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">
            {sourceHtml}
          </pre>
        </div>
      )}

      <div className="space-y-1.5 ml-2">
        {screen.fields.map((field: any, fi: number) => (
          <EditableFieldRow
            key={`${si}-${fi}-${field.selector}`}
            field={field}
            onUpdate={(updates) => updateField(si, fi, updates)}
            onDelete={() => deleteField(si, fi)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Human-readable label from raw ID ────────────────────────────────────

// Convert raw NatGen ASP.NET IDs into readable names
const ID_LABEL_MAP: Record<string, string> = {
  btnaddnewclient: "Add New Customer (button)",
  btncontinue: "Next / Continue (button)",
  btnprevious: "Previous (button)",
  btnsearch: "Search (button)",
  btnclose: "Close (button)",
  btnsave: "Save (button)",
};

function humanLabel(field: any): string {
  // If there's a real label that's not just "-" or the raw ID, use it
  if (field.label && field.label !== "-" && !field.label.startsWith("MainContent_") && !field.label.startsWith("ctl00")) {
    return field.label;
  }

  // Try to extract a readable name from the ID
  if (field.id) {
    const idLower = field.id.toLowerCase();
    // Check known button/field names
    for (const [pattern, name] of Object.entries(ID_LABEL_MAP)) {
      if (idLower.endsWith(pattern)) return name;
    }
    // Extract last meaningful part: MainContent_ucNamedInsured_txtFirstName → First Name
    const parts = field.id.split("_");
    const last = parts[parts.length - 1];
    // Remove common prefixes (txt, ddl, btn, chk, lbl)
    const cleaned = last.replace(/^(txt|ddl|btn|chk|lbl|uc)/, "");
    if (cleaned) {
      // CamelCase → spaces: "FirstName" → "First Name"
      return cleaned.replace(/([A-Z])/g, " $1").trim();
    }
  }

  return field.label || field.id || "(unlabeled)";
}

// ── Editable Field Row ──────────────────────────────────────────────────

function EditableFieldRow({
  field,
  onUpdate,
  onDelete,
}: {
  field: any;
  onUpdate: (updates: Record<string, any>) => void;
  onDelete: () => void;
}) {
  const isSelect = field.tag === "select";
  const isButton = field.type === "submit" || field.type === "button";
  const [editingLabel, setEditingLabel] = useState(false);

  // Determine current source type
  const getSourceType = (): string => {
    if (field.defaultValue) return "static";
    if (field.contactField?.startsWith("lead.")) return "lead";
    if (field.contactField?.startsWith("auto.")) return "auto";
    if (field.contactField) return "contact";
    return "unmapped";
  };

  const sourceType = getSourceType();
  const sourceValue = field.contactField || "";
  const displayLabel = humanLabel(field);

  // Border color: orange=select, blue=button, green=input
  const borderColor = isButton ? "#2196F3" : isSelect ? "#FF9800" : "#4CAF50";

  return (
    <div
      className="rounded border bg-card p-2 space-y-1.5"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      {/* Row 1: Label (editable) + type + delete */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {editingLabel ? (
            <Input
              autoFocus
              defaultValue={field.label || displayLabel}
              onBlur={(e) => {
                onUpdate({ label: e.target.value });
                setEditingLabel(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onUpdate({ label: (e.target as HTMLInputElement).value });
                  setEditingLabel(false);
                }
              }}
              className="h-6 text-xs w-48"
            />
          ) : (
            <span
              className="text-xs font-medium truncate cursor-pointer hover:underline"
              onClick={() => setEditingLabel(true)}
              title="Click to edit label"
            >
              {displayLabel}
            </span>
          )}
          <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">
            {isButton ? "button" : field.tag}
          </Badge>
        </div>
        <button
          onClick={onDelete}
          className="text-on-surface-variant hover:text-destructive transition-colors p-0.5 rounded"
          title="Remove field"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Selector */}
      <div className="font-mono text-[9px] text-green-600 truncate">
        {field.selector}
      </div>

      {/* Row 2: Controls — different for buttons vs inputs vs selects */}
      {isButton ? (
        /* Buttons: just show "Action: Click" — no data source needed */
        <div className="text-[9px] text-blue-600 font-medium">
          Action: Will be clicked to advance to next screen
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {/* For SELECT fields: show option picker */}
            {isSelect && field.options?.length > 0 && (
              <div className="flex-1">
                <select
                  value={field.selectedValue || ""}
                  onChange={(e) => onUpdate({ selectedValue: e.target.value })}
                  className="w-full h-7 text-[11px] rounded border bg-background px-2"
                >
                  <option value="">-- Select value --</option>
                  {field.options.map((o: any) => (
                    <option key={o.value} value={o.value}>
                      {o.text} ({o.value})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* For INPUT fields: data source picker */}
            {!isSelect && (
              <div className="flex-1">
                <select
                  value={sourceType === "static" ? "static" : sourceValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "static") {
                      onUpdate({ contactField: undefined, defaultValue: field.defaultValue || "" });
                    } else if (val === "unmapped") {
                      onUpdate({ contactField: undefined, defaultValue: undefined });
                    } else {
                      onUpdate({ contactField: val, defaultValue: undefined });
                    }
                  }}
                  className="w-full h-7 text-[11px] rounded border bg-background px-2"
                >
                  <option value="unmapped">-- Select source --</option>
                  {DATA_SOURCES.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <optgroup label="Manual">
                    <option value="static">Static Value (type below)</option>
                  </optgroup>
                </select>
              </div>
            )}

            {/* Static value input */}
            {sourceType === "static" && (
              <Input
                value={field.defaultValue || ""}
                onChange={(e) => onUpdate({ defaultValue: e.target.value })}
                placeholder="Enter static value..."
                className="flex-1 h-7 text-[11px]"
              />
            )}
          </div>

          {/* Show current mapping summary */}
          <div className="text-[9px] text-on-surface-variant">
            {isSelect && field.selectedValue ? (
              <span className="text-orange-600">
                Will select: {field.options?.find((o: any) => o.value === field.selectedValue)?.text || field.selectedValue}
              </span>
            ) : sourceType === "contact" || sourceType === "lead" || sourceType === "auto" ? (
              <span className="text-blue-600">
                <Database className="h-2.5 w-2.5 inline mr-0.5" />
                {SOURCE_LABEL[sourceValue] || sourceValue}
              </span>
            ) : sourceType === "static" ? (
              <span className="text-purple-600">
                Static: &quot;{field.defaultValue}&quot;
              </span>
            ) : (
              <span className="italic">Not mapped — will be skipped</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Carrier Mapper Bridge ───────────────────────────────────────────────

function CarrierMapperBridge({
  open,
  onOpenChange,
  carrierId,
  carrierName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carrierId: string;
  carrierName: string;
}) {
  const tenants = useQuery(api.organizations.getAllTenants);
  const tenantIds = (tenants ?? []).map((t: any) => t._id).slice(0, 10);

  const t0Carriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    tenantIds[0] ? { organizationId: tenantIds[0] as Id<"organizations"> } : "skip"
  );
  const t1Carriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    tenantIds[1] ? { organizationId: tenantIds[1] as Id<"organizations"> } : "skip"
  );
  const t2Carriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    tenantIds[2] ? { organizationId: tenantIds[2] as Id<"organizations"> } : "skip"
  );

  const orgWithCreds = useMemo(() => {
    const checks = [
      { orgId: tenantIds[0], carriers: t0Carriers },
      { orgId: tenantIds[1], carriers: t1Carriers },
      { orgId: tenantIds[2], carriers: t2Carriers },
    ];
    for (const check of checks) {
      if (!check.orgId || !check.carriers) continue;
      const match = (check.carriers as any[]).find(
        (tc: any) => tc.carrierId === carrierId && tc.portalConfigured
      );
      if (match) return check.orgId;
    }
    return tenantIds[0] || "";
  }, [carrierId, tenantIds, t0Carriers, t1Carriers, t2Carriers]);

  if (!carrierId) return null;

  return (
    <FieldMapperDialog
      open={open}
      onOpenChange={onOpenChange}
      organizationId={orgWithCreds}
      carriers={[{ carrierId, carrierName }]}
    />
  );
}
