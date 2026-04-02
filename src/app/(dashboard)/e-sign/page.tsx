"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileSignature,
  Plus,
  Loader2,
  Ban,
  Search,
  User,
} from "lucide-react";
import { RequestList } from "@/components/e-sign/request-list";
import { SendDialog } from "@/components/e-sign/send-dialog";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "signed", label: "Signed" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
  { value: "voided", label: "Voided" },
] as const;

export default function ESignPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [sendDialogRequest, setSendDialogRequest] = useState<string | null>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const requests = useQuery(
    api.signatureRequests.list,
    convexOrg?._id
      ? {
          organizationId: convexOrg._id,
          ...(activeTab !== "all" ? { status: activeTab } : {}),
        }
      : "skip"
  );

  const contacts = useQuery(
    api.contacts.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const markSent = useMutation(api.signatureRequests.markSent);
  const voidRequest = useMutation(api.signatureRequests.voidRequest);

  const filteredContacts = contacts?.filter((c) => {
    if (!contactSearch) return true;
    const q = contactSearch.toLowerCase();
    const name = `${c.firstName} ${c.lastName || ""}`.toLowerCase();
    return name.includes(q) || (c.email || "").toLowerCase().includes(q);
  }).slice(0, 20);

  // Loading state
  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading e-sign requests...</span>
        </div>
      </div>
    );
  }

  if (!convexOrg) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Organization Not Found</CardTitle>
            <CardDescription>
              Please complete your organization setup to manage signature requests.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Count stats
  const totalCount = requests?.length ?? 0;
  const draftCount = requests?.filter((r) => r.status === "draft").length ?? 0;
  const awaitingCount =
    requests?.filter((r) => r.status === "sent" || r.status === "viewed").length ?? 0;
  const signedCount = requests?.filter((r) => r.status === "signed").length ?? 0;

  const handleSend = async (requestId: string, expiresInDays?: number) => {
    const expiresAt = expiresInDays
      ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000
      : undefined;
    await markSent({
      id: requestId as Id<"signatureRequests">,
      expiresAt,
    });
    setSendDialogRequest(null);
  };

  const handleVoid = async (requestId: string) => {
    await voidRequest({ id: requestId as Id<"signatureRequests"> });
  };

  // Find the request being sent for the dialog
  const sendingRequest = sendDialogRequest
    ? requests?.find((r) => r._id === sendDialogRequest)
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">E-Sign</h1>
          <p className="text-on-surface-variant">
            Send documents for electronic signature
          </p>
        </div>
        <Button onClick={() => setContactPickerOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold">Total Requests</CardTitle>
            <FileSignature className="h-4 w-4 text-on-surface-variant" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-on-surface-variant">all time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold">Drafts</CardTitle>
            <FileSignature className="h-4 w-4 text-on-surface-variant" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-on-surface-variant">
              {draftCount}
            </div>
            <p className="text-xs text-on-surface-variant">not yet sent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold">Awaiting Signature</CardTitle>
            <FileSignature className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{awaitingCount}</div>
            <p className="text-xs text-on-surface-variant">sent or viewed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold">Signed</CardTitle>
            <FileSignature className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{signedCount}</div>
            <p className="text-xs text-on-surface-variant">completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Request List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Signature Requests
          </CardTitle>
          <CardDescription>
            {activeTab === "all"
              ? "All signature requests for your organization"
              : `Showing ${activeTab} requests`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-on-surface-variant">Loading requests...</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileSignature className="h-12 w-12 text-on-surface-variant/40 mb-4" />
              <h3 className="text-base font-semibold mb-1">No signature requests</h3>
              <p className="text-sm text-on-surface-variant mb-4">
                {activeTab === "all"
                  ? "Get started by creating your first signature request."
                  : `No ${activeTab} requests found.`}
              </p>
              {activeTab === "all" && (
                <Button asChild variant="outline">
                  <Link href="/e-sign/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Request
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <RequestList
              requests={requests}
              onSendRequest={(id) => setSendDialogRequest(id)}
              onVoidRequest={handleVoid}
            />
          )}
        </CardContent>
      </Card>

      {/* Send Dialog */}
      {sendingRequest && (
        <SendDialog
          open={!!sendDialogRequest}
          onOpenChange={(open) => {
            if (!open) setSendDialogRequest(null);
          }}
          request={sendingRequest}
          onSend={handleSend}
        />
      )}

      {/* Contact Picker Dialog */}
      <Dialog open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Contact</DialogTitle>
            <DialogDescription>
              Choose a contact to send a document for signature
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <ScrollArea className="max-h-72">
            {!filteredContacts ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {contactSearch ? "No contacts found" : "No contacts yet"}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredContacts.map((contact) => (
                  <button
                    key={contact._id}
                    type="button"
                    className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted transition-colors"
                    onClick={() => {
                      setContactPickerOpen(false);
                      setContactSearch("");
                      router.push(`/e-sign/new?contactId=${contact._id}`);
                    }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {contact.firstName} {contact.lastName || ""}
                      </p>
                      {contact.email && (
                        <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
