"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Upload, X, FileSpreadsheet, Check, AlertTriangle, Loader2, ArrowRight, ArrowLeft,
} from "lucide-react";

// Contact fields available for mapping
const CONTACT_FIELDS = [
  { value: "", label: "— Skip —" },
  { value: "firstName", label: "First Name *" },
  { value: "lastName", label: "Last Name" },
  { value: "company", label: "Company" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone Number" },
  { value: "phoneType", label: "Phone Type (mobile/work/home)" },
  { value: "streetAddress", label: "Street Address" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zipCode", label: "ZIP Code" },
  { value: "dateOfBirth", label: "Date of Birth" },
  { value: "gender", label: "Gender" },
  { value: "maritalStatus", label: "Marital Status" },
  { value: "notes", label: "Notes" },
];

// Auto-detect field mapping from CSV header
function autoMapField(header: string): string {
  const h = header.toLowerCase().trim();
  if (h.includes("first") && h.includes("name")) return "firstName";
  if (h === "first" || h === "firstname") return "firstName";
  if (h.includes("last") && h.includes("name")) return "lastName";
  if (h === "last" || h === "lastname") return "lastName";
  if (h === "company" || h === "business" || h === "organization") return "company";
  if (h === "email" || h.includes("e-mail") || h.includes("email address")) return "email";
  if (h === "phone" || h.includes("phone") || h.includes("mobile") || h.includes("cell")) return "phone";
  if (h === "street" || h.includes("address") || h.includes("street")) return "streetAddress";
  if (h === "city") return "city";
  if (h === "state" || h === "st") return "state";
  if (h === "zip" || h === "zipcode" || h.includes("postal") || h.includes("zip")) return "zipCode";
  if (h === "dob" || h.includes("birth") || h.includes("birthday")) return "dateOfBirth";
  if (h === "gender" || h === "sex") return "gender";
  if (h === "notes" || h === "note" || h === "comments") return "notes";
  if (h.includes("marital") || h.includes("married")) return "maritalStatus";
  return "";
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Simple CSV parser (handles quoted fields)
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

interface CsvImportWizardProps {
  organizationId: Id<"organizations">;
  onClose: () => void;
  onComplete: (count: number) => void;
}

export function CsvImportWizard({ organizationId, onClose, onComplete }: CsvImportWizardProps) {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "importing" | "done">("upload");
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [fieldMap, setFieldMap] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [fileName, setFileName] = useState("");

  const createContact = useMutation(api.contacts.create);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0) return;

      setCsvData(parsed);
      // Auto-map fields
      const autoMap: Record<number, string> = {};
      parsed.headers.forEach((h, i) => {
        autoMap[i] = autoMapField(h);
      });
      setFieldMap(autoMap);
      setStep("map");
    };
    reader.readAsText(file);
  }, []);

  const handleImport = async () => {
    if (!csvData) return;
    setStep("importing");
    setImporting(true);
    let imported = 0;
    let errors = 0;

    // Find which columns map to which fields
    const firstNameCol = Object.entries(fieldMap).find(([, v]) => v === "firstName")?.[0];
    if (firstNameCol === undefined) {
      setErrorCount(csvData.rows.length);
      setStep("done");
      return;
    }

    for (const row of csvData.rows) {
      try {
        const get = (field: string) => {
          const col = Object.entries(fieldMap).find(([, v]) => v === field)?.[0];
          return col !== undefined ? row[Number(col)]?.trim() || undefined : undefined;
        };

        const firstName = get("firstName");
        if (!firstName) { errors++; continue; }

        const phone = get("phone");
        const phoneType = get("phoneType");

        await createContact({
          organizationId,
          firstName,
          lastName: get("lastName"),
          company: get("company"),
          email: get("email"),
          streetAddress: get("streetAddress"),
          city: get("city"),
          state: get("state"),
          zipCode: get("zipCode"),
          dateOfBirth: get("dateOfBirth"),
          gender: get("gender"),
          maritalStatus: get("maritalStatus"),
          notes: get("notes"),
          phoneNumbers: phone
            ? [{ number: phone, type: (phoneType as "mobile" | "work" | "home") || "mobile", isPrimary: true }]
            : [{ number: "000-000-0000", type: "mobile" as const, isPrimary: true }],
        });
        imported++;
      } catch {
        errors++;
      }
      setImportedCount(imported);
      setErrorCount(errors);
    }

    setImporting(false);
    setStep("done");
  };

  // Get preview data (first 5 rows with mapped fields)
  const previewRows = csvData?.rows.slice(0, 5).map((row) => {
    const mapped: Record<string, string> = {};
    Object.entries(fieldMap).forEach(([col, field]) => {
      if (field && row[Number(col)]) {
        mapped[field] = row[Number(col)];
      }
    });
    return mapped;
  }) || [];

  const hasFirstName = Object.values(fieldMap).includes("firstName");
  const mappedFieldCount = Object.values(fieldMap).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative m-auto bg-card rounded-xl border shadow-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Import Contacts from CSV</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload a CSV file with your contacts. The first row should contain column headers.</p>
              <label className="flex flex-col items-center justify-center w-full py-12 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all">
                <Upload className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <span className="text-sm font-medium">Click to upload CSV</span>
                <span className="text-xs text-muted-foreground mt-1">or drag and drop</span>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          )}

          {/* Step 2: Map fields */}
          {step === "map" && csvData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{fileName}</p>
                  <p className="caption-text">{csvData.rows.length} rows, {csvData.headers.length} columns</p>
                </div>
                <Badge variant={hasFirstName ? "default" : "destructive"} className="text-xs">
                  {mappedFieldCount} fields mapped
                </Badge>
              </div>

              <div className="rounded-lg border divide-y max-h-[400px] overflow-y-auto">
                {csvData.headers.map((header, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{header}</span>
                      <span className="text-[11px] text-muted-foreground truncate block">
                        e.g. {csvData.rows[0]?.[i] || "—"}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select value={fieldMap[i] || ""} onValueChange={(v) => setFieldMap({ ...fieldMap, [i]: v })}>
                      <SelectTrigger className="w-48 h-8 text-xs">
                        <SelectValue placeholder="Skip" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {!hasFirstName && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span>First Name must be mapped to import contacts</span>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("upload")}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
                <Button onClick={() => setStep("preview")} disabled={!hasFirstName}>Preview <ArrowRight className="h-4 w-4 ml-1.5" /></Button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && csvData && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Preview — first {Math.min(5, csvData.rows.length)} of {csvData.rows.length} contacts</p>

              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      {Object.entries(fieldMap).filter(([, v]) => v).map(([col, field]) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-muted-foreground">
                          {CONTACT_FIELDS.find((f) => f.value === field)?.label || field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {Object.entries(fieldMap).filter(([, v]) => v).map(([col, field]) => (
                          <td key={col} className="px-3 py-2 truncate max-w-[150px]">{row[field] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("map")}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
                <Button onClick={handleImport}>
                  Import {csvData.rows.length} Contacts <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === "importing" && csvData && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-sm font-medium">Importing contacts...</p>
              <p className="caption-text mt-1">{importedCount + errorCount} / {csvData.rows.length}</p>
              <div className="w-48 h-2 rounded-full bg-muted mt-3 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(((importedCount + errorCount) / csvData.rows.length) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Check className="h-10 w-10 text-emerald-500 mb-4" />
              <p className="text-sm font-semibold mb-1">Import Complete</p>
              <p className="caption-text">{importedCount} contacts imported{errorCount > 0 ? `, ${errorCount} skipped` : ""}</p>
              <Button className="mt-4" onClick={() => { onComplete(importedCount); onClose(); }}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
