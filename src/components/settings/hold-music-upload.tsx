"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Upload, Trash2, Music, Loader2 } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

interface HoldMusicUploadProps {
  organizationId: Id<"organizations">;
}

export function HoldMusicUpload({ organizationId }: HoldMusicUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.holdMusic.generateUploadUrl);
  const saveHoldMusic = useMutation(api.holdMusic.saveHoldMusic);
  const deleteHoldMusic = useMutation(api.holdMusic.deleteHoldMusic);
  const holdMusicUrl = useQuery(api.holdMusic.getHoldMusicUrl, {
    organizationId,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!file.type.includes("audio/mpeg") && !file.name.endsWith(".mp3")) {
      setError("Please upload an MP3 file");
      return;
    }

    // Validate file size (max 1GB)
    if (file.size > 1024 * 1024 * 1024) {
      setError("File size must be under 1GB");
      return;
    }

    setIsUploading(true);
    try {
      // 1. Get upload URL from Convex
      const uploadUrl = await generateUploadUrl({ organizationId });

      // 2. Upload file to Convex storage
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = await response.json();

      // 3. Save reference in database
      await saveHoldMusic({ organizationId, storageId });
    } catch (err) {
      console.error("Upload failed:", err);
      setError("Failed to upload hold music. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete the custom hold music?")) {
      return;
    }

    try {
      await deleteHoldMusic({ organizationId });
    } catch (err) {
      console.error("Delete failed:", err);
      setError("Failed to delete hold music. Please try again.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Custom Hold Music
        </CardTitle>
        <CardDescription>
          Upload an MP3 file to play when callers are on hold or parked. Maximum
          file size: 1GB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {holdMusicUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
              <Music className="h-4 w-4 text-green-600" />
              <span className="text-sm">Custom hold music uploaded</span>
            </div>
            <audio controls className="w-full">
              <source src={holdMusicUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                Replace
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed p-6 text-center">
            <Music className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="mb-3 text-sm text-muted-foreground">
              No custom hold music. Using default Twilio music.
            </p>
            <Button
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
                  Upload MP3
                </>
              )}
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          onChange={handleUpload}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}
