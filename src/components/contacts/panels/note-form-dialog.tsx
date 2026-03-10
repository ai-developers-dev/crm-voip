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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface NoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Doc<"notes"> | null;
  contactId: Id<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
}

export function NoteFormDialog({ open, onOpenChange, note, contactId, organizationId, userId }: NoteFormDialogProps) {
  const createNote = useMutation(api.notes.create);
  const updateNote = useMutation(api.notes.update);

  const [content, setContent] = useState("");

  useEffect(() => {
    if (open) {
      setContent(note?.content || "");
    }
  }, [open, note]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || (!note && !userId)) return;

    if (note) {
      await updateNote({ id: note._id, content: content.trim() });
    } else {
      await createNote({
        organizationId,
        contactId,
        content: content.trim(),
        createdByUserId: userId!,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{note ? "Edit Note" : "New Note"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">Note</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Write your note here..."
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{note ? "Save" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
