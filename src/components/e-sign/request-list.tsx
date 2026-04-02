"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Eye, Download, Send, Ban, Check, X, Clock, FileText } from "lucide-react";
import Link from "next/link";

type SignatureStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "voided";

interface SignatureRequest {
  _id: string;
  fileName: string;
  contactName: string;
  contactEmail?: string;
  status: SignatureStatus;
  fields: { id: string }[];
  createdAt: number;
  sentAt?: number;
  signedAt?: number;
  viewedAt?: number;
  signedPdfStorageId?: string;
}

const statusConfig: Record<
  SignatureStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  draft: {
    label: "Draft",
    className: "bg-surface-container-high text-on-surface-variant",
    icon: FileText,
  },
  sent: {
    label: "Sent",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    icon: Send,
  },
  viewed: {
    label: "Viewed",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    icon: Eye,
  },
  signed: {
    label: "Signed",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    icon: Check,
  },
  declined: {
    label: "Declined",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: X,
  },
  expired: {
    label: "Expired",
    className: "bg-surface-container-high text-on-surface-variant",
    icon: Clock,
  },
  voided: {
    label: "Voided",
    className: "bg-surface-container-high text-on-surface-variant",
    icon: Ban,
  },
};

interface RequestListProps {
  requests: SignatureRequest[];
  onSendRequest: (id: string) => void;
  onVoidRequest: (id: string) => void;
}

export function RequestList({ requests, onSendRequest, onVoidRequest }: RequestListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Fields</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Signed</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => {
          const config = statusConfig[request.status];
          const StatusIcon = config.icon;

          return (
            <TableRow key={request._id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-on-surface-variant shrink-0" />
                  <span className="font-medium truncate max-w-[200px]">
                    {request.fileName}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{request.contactName}</div>
                  {request.contactEmail && (
                    <div className="text-xs text-on-surface-variant">
                      {request.contactEmail}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={config.className}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-sm text-on-surface-variant">
                  {request.fields.length} field{request.fields.length !== 1 ? "s" : ""}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-on-surface-variant">
                  {format(new Date(request.createdAt), "MMM d, yyyy")}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-on-surface-variant">
                  {request.sentAt
                    ? format(new Date(request.sentAt), "MMM d, yyyy")
                    : "--"}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-on-surface-variant">
                  {request.signedAt
                    ? format(new Date(request.signedAt), "MMM d, yyyy")
                    : "--"}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {request.status === "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSendRequest(request._id)}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Send
                    </Button>
                  )}
                  {(request.status === "sent" || request.status === "viewed") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onVoidRequest(request._id)}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" />
                      Void
                    </Button>
                  )}
                  {request.status === "signed" && request.signedPdfStorageId && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/e-sign/${request._id}`}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        View
                      </Link>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/e-sign/${request._id}`}>
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
