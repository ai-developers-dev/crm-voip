"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { PDFDocument, rgb } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/e-sign/signature-pad";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pen,
  Calendar,
  Type,
  Ban,
} from "lucide-react";

interface SigningClientProps {
  token: string;
}

interface FieldValue {
  fieldId: string;
  value: string; // data URL for signatures/initials, text for date/text
}

export function SigningClient({ token }: SigningClientProps) {
  const request = useQuery(api.signatureRequests.getByToken, {
    signingToken: token,
  });
  const markViewed = useMutation(api.signatureRequests.markViewed);
  const completeSigning = useMutation(api.signatureRequests.complete);
  const declineSigning = useMutation(api.signatureRequests.decline);
  const generateUploadUrl = useMutation(
    api.signatureRequests.generateSignedUploadUrl
  );

  const pdfPageRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfReady, setPdfReady] = useState(false);
  const [fieldValues, setFieldValues] = useState<FieldValue[]>([]);
  const [sigPadOpen, setSigPadOpen] = useState(false);
  const [sigPadMode, setSigPadMode] = useState<"signature" | "initials">(
    "signature"
  );
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [editingTextField, setEditingTextField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markedViewed, setMarkedViewed] = useState(false);

  // PDF dimensions for coordinate mapping
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);

  // Mark as viewed on first load
  useEffect(() => {
    if (
      request &&
      !markedViewed &&
      (request.status === "sent" || request.status === "viewed")
    ) {
      setMarkedViewed(true);
      markViewed({ signingToken: token }).catch(() => {
        // Silently ignore - not critical
      });
    }
  }, [request, markedViewed, markViewed, token]);

  // Load PDF pages as blob URLs for iframe rendering
  const [pageUrls, setPageUrls] = useState<Map<number, string>>(new Map());
  const [pdfLoading, setPdfLoading] = useState(true);

  useEffect(() => {
    if (!request?.pdfUrl) return;
    let cancelled = false;

    async function loadPages() {
      setPdfLoading(true);
      try {
        const resp = await fetch(request!.pdfUrl!);
        const bytes = await resp.arrayBuffer();
        const doc = await PDFDocument.load(bytes);
        const pageCount = doc.getPageCount();

        if (cancelled) return;
        setTotalPages(pageCount);

        const urls = new Map<number, string>();
        for (let i = 0; i < pageCount; i++) {
          const singleDoc = await PDFDocument.create();
          const [page] = await singleDoc.copyPages(doc, [i]);
          singleDoc.addPage(page);
          const singleBytes = await singleDoc.save();
          const blob = new Blob([singleBytes as BlobPart], { type: "application/pdf" });
          urls.set(i, URL.createObjectURL(blob));
        }

        if (!cancelled) {
          setPageUrls(urls);
          setPdfReady(true);
          setPdfLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("PDF load error:", err);
          setError("Failed to load the document. Please try refreshing.");
          setPdfLoading(false);
        }
      }
    }

    loadPages();
    return () => { cancelled = true; };
  }, [request?.pdfUrl]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => { pageUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [pageUrls]);

  const fieldsOnCurrentPage = (request?.fields || []).filter(
    (f) => f.page === currentPage
  );

  const getFieldValue = useCallback(
    (fieldId: string) => fieldValues.find((v) => v.fieldId === fieldId),
    [fieldValues]
  );

  const setFieldValue = useCallback(
    (fieldId: string, value: string) => {
      setFieldValues((prev) => {
        const existing = prev.findIndex((v) => v.fieldId === fieldId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { fieldId, value };
          return updated;
        }
        return [...prev, { fieldId, value }];
      });
    },
    []
  );

  const allRequiredFilled =
    request?.fields
      .filter((f) => f.required)
      .every((f) => getFieldValue(f.id)?.value) ?? false;

  function handleFieldClick(fieldId: string, fieldType: string) {
    if (fieldType === "signature" || fieldType === "initials") {
      setActiveFieldId(fieldId);
      setSigPadMode(fieldType as "signature" | "initials");
      setSigPadOpen(true);
    } else if (fieldType === "date") {
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      setFieldValue(fieldId, today);
    } else if (fieldType === "text") {
      setEditingTextField(fieldId);
    }
  }

  function handleSignatureSave(dataUrl: string) {
    if (activeFieldId) {
      setFieldValue(activeFieldId, dataUrl);
      setActiveFieldId(null);
    }
  }

  async function handleSubmit() {
    if (!request || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      // Load original PDF with pdf-lib
      const pdfBytes = await fetch(request.pdfUrl!).then((r) =>
        r.arrayBuffer()
      );
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Embed each field value
      for (const field of request.fields) {
        const fv = getFieldValue(field.id);
        if (!fv) continue;

        const page = pdfDoc.getPage(field.page);
        const { width, height } = page.getSize();

        if (
          field.type === "signature" ||
          field.type === "initials"
        ) {
          // Embed PNG image
          const imgBytes = await fetch(fv.value).then((r) =>
            r.arrayBuffer()
          );
          const img = await pdfDoc.embedPng(imgBytes);
          page.drawImage(img, {
            x: (field.x / 100) * width,
            y:
              height -
              (field.y / 100) * height -
              (field.height / 100) * height,
            width: (field.width / 100) * width,
            height: (field.height / 100) * height,
          });
        } else {
          // Text or date field
          page.drawText(fv.value, {
            x: (field.x / 100) * width,
            y: height - (field.y / 100) * height - 12,
            size: 12,
            color: rgb(0.1, 0.1, 0.12),
          });
        }
      }

      const modifiedPdf = await pdfDoc.save();

      // Upload to Convex storage
      const uploadUrl = await generateUploadUrl({ signingToken: token });
      const uploadResp = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: new Blob([modifiedPdf as BlobPart], { type: "application/pdf" }),
      });

      if (!uploadResp.ok) {
        throw new Error("Failed to upload signed document");
      }

      const { storageId } = await uploadResp.json();

      // Complete the signing
      await completeSigning({
        signingToken: token,
        signedPdfStorageId: storageId,
        signerName: request.contactName || "Unknown",
      });

      setCompleted(true);
    } catch (err) {
      console.error("Signing error:", err);
      setError(
        (err as Error).message || "Failed to complete signing. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (declining) return;
    setDeclining(true);
    try {
      await declineSigning({ signingToken: token });
      setDeclined(true);
    } catch (err) {
      setError((err as Error).message || "Failed to decline.");
    } finally {
      setDeclining(false);
    }
  }

  // Loading state
  if (request === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  // Not found
  if (request === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto size-12 text-amber-500" />
          <h1 className="mt-4 text-xl font-semibold">Document Not Found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This signing link is invalid or the document has been removed.
          </p>
        </div>
      </div>
    );
  }

  // Already signed
  if (request.status === "signed" || completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto size-12 text-green-500" />
          <h1 className="mt-4 text-xl font-semibold">Document Signed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you! This document has been signed successfully. You can close
            this page.
          </p>
        </div>
      </div>
    );
  }

  // Declined
  if (request.status === "declined" || declined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto size-12 text-red-500" />
          <h1 className="mt-4 text-xl font-semibold">Signing Declined</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You have declined to sign this document. The sender has been
            notified.
          </p>
        </div>
      </div>
    );
  }

  // Expired
  if (
    request.status === "expired" ||
    (request.expiresAt && Date.now() > request.expiresAt)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
          <Clock className="mx-auto size-12 text-amber-500" />
          <h1 className="mt-4 text-xl font-semibold">Link Expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This signing request has expired. Please contact the sender for a
            new link.
          </p>
        </div>
      </div>
    );
  }

  // Voided
  if (request.status === "voided") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
          <Ban className="mx-auto size-12 text-gray-400" />
          <h1 className="mt-4 text-xl font-semibold">Document Voided</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This document has been voided by the sender and can no longer be
            signed.
          </p>
        </div>
      </div>
    );
  }

  // Draft (shouldn't be accessible but handle gracefully)
  if (request.status === "draft") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto size-12 text-gray-400" />
          <h1 className="mt-4 text-xl font-semibold">Not Ready Yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This document is still being prepared. You will receive an email when
            it is ready to sign.
          </p>
        </div>
      </div>
    );
  }

  // Main signing UI
  const filledCount = request.fields.filter(
    (f) => getFieldValue(f.id)?.value
  ).length;
  const requiredCount = request.fields.filter((f) => f.required).length;
  const filledRequiredCount = request.fields.filter(
    (f) => f.required && getFieldValue(f.id)?.value
  ).length;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="size-5 text-primary" />
            <div>
              <h1 className="text-sm font-semibold">{request.fileName}</h1>
              <p className="text-xs text-muted-foreground">
                Sent for your signature
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {filledRequiredCount}/{requiredCount} required fields
            </Badge>
            <Badge variant="outline" className="text-xs">
              {filledCount}/{request.fields.length} total
            </Badge>
          </div>
        </div>
      </header>

      {/* Message */}
      {request.message && (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4">
          <div className="rounded-lg border bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-medium">Message from sender:</p>
            <p className="mt-1">{request.message}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        </div>
      )}

      {/* PDF Viewer with Field Overlays */}
      <div className="flex-1 px-4 py-4">
        <div
          ref={containerRef}
          className="relative mx-auto max-w-5xl overflow-auto rounded-lg border bg-white shadow-sm"
        >
          <div className="relative" style={{ height: "700px" }}>
            {pdfLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* PDF rendered in iframe */}
                {pageUrls.get(currentPage) && (
                  <iframe
                    src={`${pageUrls.get(currentPage)}#toolbar=0&navpanes=0&scrollbar=0`}
                    className="absolute inset-0 w-full h-full border-0"
                    title={`Page ${currentPage + 1}`}
                  />
                )}

                {/* Field overlays on top of iframe */}
                {pdfReady && fieldsOnCurrentPage.map((field) => {
                  const fv = getFieldValue(field.id);
                  const displayWidth = containerRef.current?.clientWidth || 800;
                  const displayHeight = 700;

                const left = (field.x / 100) * displayWidth;
                const top = (field.y / 100) * displayHeight;
                const w = (field.width / 100) * displayWidth;
                const h = (field.height / 100) * displayHeight;

                const isFilled = !!fv?.value;
                const isEditing = editingTextField === field.id;

                return (
                  <div
                    key={field.id}
                    className={`absolute cursor-pointer rounded border-2 transition-colors ${
                      isFilled
                        ? "border-green-400 bg-green-50/50"
                        : "border-primary/60 bg-primary/5 hover:bg-primary/10"
                    }`}
                    style={{ left, top, width: w, height: h }}
                    onClick={() => {
                      if (!isEditing) {
                        handleFieldClick(field.id, field.type);
                      }
                    }}
                  >
                    {/* Field content */}
                    {isFilled ? (
                      field.type === "signature" || field.type === "initials" ? (
                        <img
                          src={fv!.value}
                          alt={field.type}
                          className="size-full object-contain"
                        />
                      ) : (
                        <div className="flex size-full items-center px-1">
                          <span className="text-xs font-medium text-gray-800">
                            {fv!.value}
                          </span>
                        </div>
                      )
                    ) : isEditing ? (
                      <Input
                        autoFocus
                        className="h-full border-0 bg-transparent text-xs focus-visible:ring-0"
                        placeholder={field.label || "Enter text"}
                        onBlur={(e) => {
                          if (e.target.value.trim()) {
                            setFieldValue(field.id, e.target.value.trim());
                          }
                          setEditingTextField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) setFieldValue(field.id, val);
                            setEditingTextField(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center gap-1 text-primary/70">
                        {field.type === "signature" && (
                          <Pen className="size-3" />
                        )}
                        {field.type === "initials" && (
                          <Type className="size-3" />
                        )}
                        {field.type === "date" && (
                          <Calendar className="size-3" />
                        )}
                        {field.type === "text" && (
                          <Type className="size-3" />
                        )}
                        <span className="text-[10px] font-medium">
                          {field.label ||
                            field.type.charAt(0).toUpperCase() +
                              field.type.slice(1)}
                        </span>
                        {field.required && (
                          <span className="text-[10px] text-red-500">*</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              </>
            )}
          </div>
        </div>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div className="mx-auto mt-3 flex max-w-5xl items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={currentPage === totalPages - 1}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <footer className="border-t bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Button
            variant="outline"
            onClick={handleDecline}
            disabled={declining || submitting}
            className="text-red-600 hover:text-red-700"
          >
            {declining ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <XCircle className="mr-1.5 size-4" />
            )}
            Decline
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!allRequiredFilled || submitting}
          >
            {submitting ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 size-4" />
            )}
            Submit Signature
          </Button>
        </div>
      </footer>

      {/* Signature pad modal */}
      <SignaturePad
        open={sigPadOpen}
        onOpenChange={setSigPadOpen}
        onSave={handleSignatureSave}
        mode={sigPadMode}
        signerName={request.contactName}
      />
    </div>
  );
}
