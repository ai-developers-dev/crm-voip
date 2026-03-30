"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DocumentType = "contract" | "id" | "application" | "claim" | "correspondence" | "other";
type DocumentStatus = "draft" | "final" | "archived";

interface DocumentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Doc<"documents"> | null;
  contactId: Id<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
}

export function DocumentFormDialog({ open, onOpenChange, document, contactId, organizationId, userId }: DocumentFormDialogProps) {
  const createDocument = useMutation(api.documents.create);
  const updateDocument = useMutation(api.documents.update);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<DocumentType>("other");
  const [status, setStatus] = useState<DocumentStatus>("draft");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  useEffect(() => {
    if (open) {
      if (document) {
        setTitle(document.title);
        setDescription(document.description || "");
        setType(document.type as DocumentType);
        setStatus(document.status as DocumentStatus);
        setFileName(document.fileName || "");
        setFileUrl(document.fileUrl || "");
      } else {
        setTitle("");
        setDescription("");
        setType("other");
        setStatus("draft");
        setFileName("");
        setFileUrl("");
      }
    }
  }, [open, document]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || (!document && !userId)) return;

    if (document) {
      await updateDocument({
        id: document._id,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        status,
        fileName: fileName.trim() || undefined,
        fileUrl: fileUrl.trim() || undefined,
      });
    } else {
      await createDocument({
        organizationId,
        contactId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        status,
        fileName: fileName.trim() || undefined,
        fileUrl: fileUrl.trim() || undefined,
        createdByUserId: userId!,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{document ? "Edit Document" : "New Document"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select id="type" value={type} onChange={(e) => setType(e.target.value as DocumentType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="contract">Contract</option>
                <option value="id">ID</option>
                <option value="application">Application</option>
                <option value="claim">Claim</option>
                <option value="correspondence">Correspondence</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value as DocumentStatus)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="draft">Draft</option>
                <option value="final">Final</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fileName">File Name</Label>
            <Input id="fileName" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="document.pdf" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fileUrl">File URL</Label>
            <Input id="fileUrl" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{document ? "Save" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
