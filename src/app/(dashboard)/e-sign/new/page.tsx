"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Upload,
  FileText,
  ArrowLeft,
  ArrowRight,
  Send,
  CheckCircle2,
  Search,
  User,
} from "lucide-react";
import { PdfViewer } from "@/components/e-sign/pdf-viewer";
import { FieldPlacer, type Field } from "@/components/e-sign/field-placer";
import { FieldToolbar } from "@/components/e-sign/field-toolbar";

type Step = 1 | 2 | 3;

export default function NewSignatureRequestPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <NewSignatureRequestContent />
    </Suspense>
  );
}

function NewSignatureRequestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedContactId = searchParams.get("contactId");
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user } = useUser();

  // Org lookup
  const org = useQuery(
    api.organizations.getByClerkId,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );
  const currentUser = useQuery(
    api.users.getByClerkId,
    user?.id && org?._id ? { clerkUserId: user.id, organizationId: org._id } : "skip"
  );

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [file, setFile] = useState<File | null>(null);
  const [storageId, setStorageId] = useState<Id<"_storage"> | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<Id<"contacts"> | null>(null);
  const [selectedContactName, setSelectedContactName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [fields, setFields] = useState<Field[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [placingType, setPlacingType] = useState<Field["type"] | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Step 3 state
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Contacts query
  const contacts = useQuery(
    api.contacts.getByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  // Mutations
  const generateUploadUrl = useMutation(api.signatureRequests.generateUploadUrl);
  const createRequest = useMutation(api.signatureRequests.create);

  // Auto-select contact from URL param
  useEffect(() => {
    if (preselectedContactId && contacts && !selectedContactId) {
      const contact = contacts.find((c) => c._id === preselectedContactId);
      if (contact) {
        setSelectedContactId(contact._id as Id<"contacts">);
        setSelectedContactName(`${contact.firstName} ${contact.lastName || ""}`.trim());
      }
    }
  }, [preselectedContactId, contacts, selectedContactId]);

  // Filtered contacts for search
  const filteredContacts = contacts?.filter((c) => {
    if (!contactSearch.trim()) return false;
    const name = `${c.firstName} ${c.lastName || ""}`.toLowerCase();
    const email = (c.email || "").toLowerCase();
    const search = contactSearch.toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  // Upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected || !org?._id) return;

    if (selected.type !== "application/pdf") {
      setUploadError("Please select a PDF file.");
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      setUploadError("File must be under 50MB.");
      return;
    }

    setFile(selected);
    setUploadError(null);
    setIsUploading(true);

    try {
      const uploadUrl = await generateUploadUrl({ organizationId: org._id });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selected.type },
        body: selected,
      });

      if (!response.ok) throw new Error("Upload failed");

      const { storageId: sid } = await response.json();
      setStorageId(sid);

      // Create a local URL for preview
      const localUrl = URL.createObjectURL(selected);
      setPdfUrl(localUrl);
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError("Failed to upload PDF. Please try again.");
      setFile(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddField = useCallback(
    (type: Field["type"]) => {
      setPlacingType((prev) => (prev === type ? null : type));
    },
    []
  );

  const handleFieldPlaced = useCallback(() => {
    // Keep the placing type active so user can place multiple fields
  }, []);

  const canAdvanceStep1 = storageId && selectedContactId && subject.trim();

  const handleSend = async () => {
    if (!org?._id || !storageId || !selectedContactId || !currentUser?._id) return;

    setIsSending(true);
    setSendError(null);

    try {
      // Create the signature request (as draft)
      const requestId = await createRequest({
        organizationId: org._id,
        contactId: selectedContactId,
        originalPdfStorageId: storageId,
        fileName: file?.name || "document.pdf",
        fields,
        subject: subject || undefined,
        message: message || undefined,
        createdByUserId: currentUser._id,
      });

      // Send the email (the API also marks as sent)
      const resp = await fetch("/api/e-sign/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureRequestId: requestId,
          organizationId: org._id,
        }),
      });

      const result = await resp.json();

      if (!result.success) {
        // If email failed, the request is still a draft — show the error
        setSendError(
          result.error || "Failed to send. Please check your email configuration in Settings."
        );
        return;
      }

      router.push("/e-sign");
    } catch (err) {
      console.error("Send failed:", err);
      setSendError("Failed to send signature request. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // Loading
  if (!orgLoaded || org === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (!organization || !org) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Organization Selected</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height))]">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">New Signature Request</h1>
            <p className="text-sm text-on-surface-variant">
              Step {step} of 3 —{" "}
              {step === 1
                ? "Upload & Details"
                : step === 2
                  ? "Place Fields"
                  : "Review & Send"}
            </p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Step 1: Upload & Contact */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* PDF Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Document</CardTitle>
              </CardHeader>
              <CardContent>
                {uploadError && (
                  <div className="mb-4 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                    {uploadError}
                  </div>
                )}

                {file && storageId ? (
                  <div className="flex items-center gap-3 rounded-md bg-surface-container p-3">
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFile(null);
                        setStorageId(null);
                        setPdfUrl(null);
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div
                    className="rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
                        <p className="text-sm text-on-surface-variant">Uploading...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-on-surface-variant" />
                        <p className="text-sm font-medium">Click to upload PDF</p>
                        <p className="text-xs text-on-surface-variant">Max 50MB</p>
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </CardContent>
            </Card>

            {/* Contact Selector */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Recipient</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedContactId ? (
                  <div className="flex items-center gap-3 rounded-md bg-surface-container p-3">
                    <User className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium flex-1">{selectedContactName}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedContactId(null);
                        setSelectedContactName("");
                        setContactSearch("");
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
                    <Input
                      placeholder="Search contacts by name or email..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="pl-9"
                    />
                    {filteredContacts && filteredContacts.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-md max-h-48 overflow-y-auto">
                        {filteredContacts.map((contact) => (
                          <button
                            key={contact._id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                            onClick={() => {
                              setSelectedContactId(contact._id);
                              setSelectedContactName(
                                `${contact.firstName} ${contact.lastName || ""}`.trim()
                              );
                              setContactSearch("");
                            }}
                          >
                            <p className="font-medium">
                              {contact.firstName} {contact.lastName || ""}
                            </p>
                            {contact.email && (
                              <p className="text-xs text-on-surface-variant">{contact.email}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {contactSearch.trim() &&
                      filteredContacts &&
                      filteredContacts.length === 0 && (
                        <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-md p-3 text-sm text-on-surface-variant text-center">
                          No contacts found
                        </div>
                      )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subject & Message */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    placeholder="Please sign this document"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message (optional)</Label>
                  <Textarea
                    id="message"
                    placeholder="Add a message for the recipient..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Next button */}
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!canAdvanceStep1}>
                Next: Place Fields
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Place Fields */}
        {step === 2 && pdfUrl && (
          <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="px-6 py-3 border-b flex items-center justify-between">
              <FieldToolbar
                onAddField={handleAddField}
                activeType={placingType}
              />
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                {fields.length} field{fields.length !== 1 ? "s" : ""} placed
              </div>
            </div>

            {/* PDF + overlay */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div ref={pdfContainerRef} className="relative">
                  <PdfViewer
                    pdfUrl={pdfUrl}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    totalPages={totalPages}
                    onTotalPagesChange={setTotalPages}
                    containerRef={pdfContainerRef}
                  />
                  {/* Field overlay sits on top of the canvas area */}
                  <div className="absolute inset-0" style={{ bottom: totalPages > 0 ? "49px" : "0" }}>
                    <FieldPlacer
                      fields={fields}
                      onFieldsChange={setFields}
                      pageWidth={pdfContainerRef.current?.clientWidth || 600}
                      pageHeight={pdfContainerRef.current?.clientHeight || 800}
                      currentPage={currentPage}
                      placingType={placingType}
                      onPlaced={handleFieldPlaced}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom nav */}
            <div className="px-6 py-3 border-t flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={fields.length === 0}>
                Review & Send
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Send */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {sendError && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {sendError}
              </div>
            )}

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-1">
                      Document
                    </p>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="truncate">{file?.name || "document.pdf"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-1">
                      Recipient
                    </p>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      <span>{selectedContactName}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-1">
                      Subject
                    </p>
                    <span>{subject}</span>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-1">
                      Fields
                    </p>
                    <span>{fields.length} field{fields.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                {message && (
                  <div>
                    <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-1">
                      Message
                    </p>
                    <p className="text-sm">{message}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Field breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Fields by Page</CardTitle>
              </CardHeader>
              <CardContent>
                {totalPages > 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      const pageFields = fields.filter((f) => f.page === page);
                      if (pageFields.length === 0) return null;
                      return (
                        <div key={page} className="flex items-center justify-between text-sm py-1">
                          <span className="text-on-surface-variant">Page {page}</span>
                          <span className="font-medium">
                            {pageFields.length} field{pageFields.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant">No fields placed</p>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleSend} disabled={isSending}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send for Signature
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
