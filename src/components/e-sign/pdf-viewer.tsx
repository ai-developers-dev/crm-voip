"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";

interface PdfViewerProps {
  pdfUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
  onTotalPagesChange: (n: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  width?: number;
}

export function PdfViewer({
  pdfUrl,
  currentPage,
  onPageChange,
  totalPages,
  onTotalPagesChange,
  containerRef: externalContainerRef,
}: PdfViewerProps) {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageImages, setPageImages] = useState<Map<number, string>>(new Map());
  const pdfBytesRef = useRef<ArrayBuffer | null>(null);

  // Load PDF and render pages using pdf-lib + canvas
  useEffect(() => {
    let cancelled = false;

    async function loadAndRender() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch the PDF bytes
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error("Failed to fetch PDF");
        const bytes = await response.arrayBuffer();
        pdfBytesRef.current = bytes;

        if (cancelled) return;

        // Use pdf-lib to get page count
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.load(bytes);
        const pageCount = doc.getPageCount();

        if (cancelled) return;
        onTotalPagesChange(pageCount);

        // Render each page as an image using an offscreen approach
        // We'll create single-page PDFs and render them via blob URLs
        const images = new Map<number, string>();
        for (let i = 0; i < pageCount; i++) {
          const singlePageDoc = await PDFDocument.create();
          const [copiedPage] = await singlePageDoc.copyPages(doc, [i]);
          singlePageDoc.addPage(copiedPage);
          const singlePageBytes = await singlePageDoc.save();
          const blob = new Blob([singlePageBytes as BlobPart], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          images.set(i + 1, url);
        }

        if (cancelled) {
          images.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        setPageImages(images);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF load error:", err);
          setError("Failed to load PDF. Please try again.");
          setIsLoading(false);
        }
      }
    }

    loadAndRender();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      pageImages.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pageImages]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-sm text-destructive">
        <p>{error}</p>
      </div>
    );
  }

  const currentPageUrl = pageImages.get(currentPage);

  return (
    <div className="flex flex-col">
      <div ref={internalContainerRef} className="relative bg-white min-h-[500px]">
        {isLoading ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : currentPageUrl ? (
          <iframe
            src={`${currentPageUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="w-full border-0"
            style={{ height: "700px" }}
            title={`PDF Page ${currentPage}`}
          />
        ) : (
          <div className="flex items-center justify-center p-16 text-muted-foreground">
            No page to display
          </div>
        )}
      </div>

      {totalPages > 0 && (
        <div className="flex items-center justify-center gap-3 py-3 border-t">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
