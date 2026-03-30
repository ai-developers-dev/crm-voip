"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  currentImageUrl: string | null | undefined;
  onUpload: (file: File) => Promise<void>;
  onDelete: () => Promise<void>;
  label: string;
  description?: string;
  accept?: string;
  maxSizeMB?: number;
  previewShape?: "rounded" | "circle";
  previewSize?: string;
}

export function ImageUpload({
  currentImageUrl,
  onUpload,
  onDelete,
  label,
  description,
  accept = "image/png,image/jpeg,image/webp",
  maxSizeMB = 5,
  previewShape = "rounded",
  previewSize = "h-16 w-16",
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    const validTypes = accept.split(",").map((t) => t.trim());
    const ext = file.name.toLowerCase().split(".").pop();
    const mimeMatch = validTypes.includes(file.type);
    const extMatch = ext && ["png", "jpg", "jpeg", "webp", "svg"].includes(ext);
    if (!mimeMatch && !extMatch) {
      const labels = validTypes.map((t) => t.replace("image/", "").replace("svg+xml", "svg").toUpperCase());
      setError(`Please upload a valid image file (${labels.join(", ")})`);
      return;
    }

    // Validate file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File size must be under ${maxSizeMB}MB`);
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      console.error("Upload failed:", err);
      setError(`Failed to upload ${label.toLowerCase()}. Please try again.`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to remove the ${label.toLowerCase()}?`)) {
      return;
    }

    try {
      await onDelete();
    } catch (err) {
      console.error("Delete failed:", err);
      setError(`Failed to remove ${label.toLowerCase()}. Please try again.`);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {currentImageUrl ? (
        <div className="flex items-center gap-4">
          <img
            src={currentImageUrl}
            alt={label}
            className={cn(
              previewSize,
              "object-cover border",
              previewShape === "circle" ? "rounded-full" : "rounded-lg"
            )}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Replace
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed p-6 text-center">
          <ImageIcon className="mx-auto mb-2 h-8 w-8 text-on-surface-variant" />
          <p className="mb-1 text-sm font-medium">{label}</p>
          {description && (
            <p className="mb-3 text-xs text-on-surface-variant">{description}</p>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </>
            )}
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
