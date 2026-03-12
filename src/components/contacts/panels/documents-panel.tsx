"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { X, Plus, Search, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentFormDialog } from "./document-form-dialog";
import { documentStatusColors } from "@/lib/style-constants";

interface DocumentsPanelProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  contract: "Contract",
  id: "ID",
  application: "Application",
  claim: "Claim",
  correspondence: "Correspondence",
  other: "Other",
};


export function DocumentsPanel({ contact, organizationId, userId, onClose }: DocumentsPanelProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Doc<"documents"> | null>(null);

  const documents = useQuery(api.documents.getByContact, { contactId: contact._id });
  const removeDocument = useMutation(api.documents.remove);

  const filtered = documents?.filter((d) =>
    `${d.title} ${d.fileName || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Documents</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => { setEditingDocument(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 px-4 pb-4">
          {filtered?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No documents found</p>
          )}
          {filtered?.map((doc) => (
            <div key={doc._id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium leading-tight">{doc.title}</p>
                  {doc.fileName && (
                    <p className="text-xs text-muted-foreground mt-0.5">{doc.fileName}</p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditingDocument(doc); setDialogOpen(true); }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => removeDocument({ id: doc._id })}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {doc.status}
                </Badge>
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {typeLabels[doc.type] || doc.type}
                </Badge>
                {doc.fileSize != null && (
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(doc.fileSize)}
                  </span>
                )}
              </div>
              {doc.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <DocumentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        document={editingDocument}
        contactId={contact._id}
        organizationId={organizationId}
        userId={userId}
      />
    </div>
  );
}
