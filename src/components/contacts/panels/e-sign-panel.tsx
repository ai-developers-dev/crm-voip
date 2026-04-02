"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { X, Plus, FileSignature, Send, Eye, Download, Ban, Clock, Check, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import Link from "next/link";

interface ESignPanelProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground", icon: FileSignature },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400", icon: Send },
  viewed: { label: "Viewed", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400", icon: Eye },
  signed: { label: "Signed", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400", icon: Check },
  declined: { label: "Declined", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400", icon: XCircle },
  expired: { label: "Expired", color: "bg-muted text-muted-foreground", icon: Clock },
  voided: { label: "Voided", color: "bg-muted text-muted-foreground", icon: Ban },
};

export function ESignPanel({ contact, organizationId, userId, onClose }: ESignPanelProps) {
  const requests = useQuery(api.signatureRequests.list, { organizationId });
  const voidRequest = useMutation(api.signatureRequests.voidRequest);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  // Filter to this contact's requests
  const contactRequests = requests?.filter((r) => r.contactId === contact._id) || [];

  const handleVoid = async (id: Id<"signatureRequests">) => {
    setVoidingId(id);
    try {
      await voidRequest({ id });
    } finally {
      setVoidingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">E-Signatures</h3>
          {contactRequests.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {contactRequests.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/e-sign/new?contactId=${contact._id}`}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Plus className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {requests === undefined ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : contactRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <FileSignature className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No signature requests</p>
            <p className="text-xs text-muted-foreground/70 mb-4">
              Send a document for {contact.firstName} to sign
            </p>
            <Link href={`/e-sign/new?contactId=${contact._id}`}>
              <Button size="sm" variant="outline" className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                New Request
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {contactRequests.map((request) => {
              const status = statusConfig[request.status] || statusConfig.draft;
              const StatusIcon = status.icon;
              return (
                <div key={request._id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{request.fileName}</p>
                      {request.subject && (
                        <p className="text-xs text-muted-foreground truncate">{request.subject}</p>
                      )}
                    </div>
                    <Badge className={`${status.color} text-[10px] shrink-0 gap-1`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span>{format(request.createdAt, "MMM d, yyyy")}</span>
                    {request.sentAt && <span>Sent {format(request.sentAt, "MMM d")}</span>}
                    {request.signedAt && <span>Signed {format(request.signedAt, "MMM d")}</span>}
                    <span>{request.fields.length} fields</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {request.status === "signed" && request.signedPdfStorageId && (
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2 gap-1">
                        <Download className="h-3 w-3" />
                        Download
                      </Button>
                    )}
                    {(request.status === "sent" || request.status === "viewed") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2 gap-1 text-destructive hover:text-destructive"
                        onClick={() => handleVoid(request._id)}
                        disabled={voidingId === request._id}
                      >
                        {voidingId === request._id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Ban className="h-3 w-3" />
                        )}
                        Void
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
