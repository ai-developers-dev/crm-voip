"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, FileSignature, Plus, Phone, MessageSquare, Users, Calendar,
  BarChart3, Bot, Workflow, Columns3, Settings, ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
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

export default function TenantESignPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const [activeTab, setActiveTab] = useState("all");
  const [sendDialogRequest, setSendDialogRequest] = useState<string | null>(null);

  const tenant = useQuery(api.organizations.getById, {
    organizationId: tenantId as Id<"organizations">,
  });

  const requests = useQuery(
    api.signatureRequests.list,
    tenant?._id
      ? {
          organizationId: tenant._id,
          ...(activeTab !== "all" ? { status: activeTab } : {}),
        }
      : "skip"
  );

  const markSent = useMutation(api.signatureRequests.markSent);
  const voidRequest = useMutation(api.signatureRequests.voidRequest);

  if (!tenant) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
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
    <div className="flex flex-col h-[calc(100vh-var(--header-height))]">
      {/* Nav */}
      <div className="border-b bg-surface-container/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}>
              <Button variant="ghost" size="sm" className="gap-2"><Phone className="h-4 w-4" />Calls</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}>
              <Button variant="ghost" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />SMS</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}>
              <Button variant="ghost" size="sm" className="gap-2"><Users className="h-4 w-4" />Contacts</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}>
              <Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}>
              <Button variant="ghost" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}>
              <Button variant="ghost" size="sm" className="gap-2"><Workflow className="h-4 w-4" />Workflows</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/pipelines`}>
              <Button variant="ghost" size="sm" className="gap-2"><Columns3 className="h-4 w-4" />Pipelines</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/e-sign`}>
              <Button variant="ghost" size="sm" className="gap-2 border-b-2 border-primary rounded-none"><FileSignature className="h-4 w-4" />E-Sign</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/tasks`}>
              <Button variant="ghost" size="sm" className="gap-2"><ClipboardCheck className="h-4 w-4" />Tasks</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}>
              <Button variant="ghost" size="sm" className="gap-2"><Bot className="h-4 w-4" />AI Agents</Button>
            </Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}>
            <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings</Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">E-Sign</h1>
              <p className="text-sm text-on-surface-variant">
                Signature requests for {tenant.name}
              </p>
            </div>
            <Button asChild>
              <Link href="/e-sign/new">
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Link>
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
                <div className="text-2xl font-bold text-on-surface-variant">{draftCount}</div>
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
                  ? `All signature requests for ${tenant.name}`
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
                      ? "No signature requests have been created for this organization yet."
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
        </div>
      </div>

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
    </div>
  );
}
