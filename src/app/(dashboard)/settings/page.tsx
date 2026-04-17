"use client";

import { useState } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Phone, Users, CheckCircle, XCircle, Loader2,
  Building2, Pencil, AlertCircle, Mail, Unplug, Briefcase,
  Music, Settings, ImageIcon, Plus, Trash2, UserPlus, MoreHorizontal, Tag, Workflow,
  MessageSquare, CreditCard, Clock
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Id } from "../../../../convex/_generated/dataModel";
import { updateOwnOrganization, UpdateOwnOrganizationData } from "./actions";
import { addUserToOrganization, removeUserFromOrganization } from "../admin/actions";
import { HoldMusicUpload } from "@/components/settings/hold-music-upload";
import { SalesGoalsManager } from "@/components/settings/sales-goals-manager";
import { ImageUpload } from "@/components/settings/image-upload";
import { SettingsRow } from "@/components/settings/settings-row";
import { TwilioSettingsDialog } from "@/components/settings/twilio-settings-dialog";
import { CarriersSettingsDialog } from "@/components/settings/carriers-settings-dialog";
import { PhoneNumbersManager } from "@/components/settings/phone-numbers-manager";
import { tagColors, TAG_COLOR_OPTIONS } from "@/lib/style-constants";
import { A2pRegistration } from "@/components/settings/a2p-registration";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";

function TenantInvoiceHistory({ organizationId }: { organizationId: any }) {
  const invoices = useQuery(api.usageInvoices.getByOrganization, { organizationId });

  if (!invoices || invoices.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold mb-2">Usage Invoices</h4>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {invoices.slice(0, 12).map((inv: any) => {
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return (
            <div key={inv._id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{monthNames[inv.month]} {inv.year}</span>
                <span className="text-xs text-on-surface-variant ml-2">
                  {inv.twilioCallMinutes}min · {inv.twilioSmsSent} SMS
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">${(inv.totalChargedCents / 100).toFixed(2)}</span>
                {inv.status === "paid" && <span className="text-[10px] text-green-600 font-medium">Paid</span>}
                {inv.status === "sent" && <span className="text-[10px] text-blue-600 font-medium">Pending</span>}
                {inv.status === "failed" && <span className="text-[10px] text-destructive font-medium">Failed</span>}
                {inv.status === "draft" && <span className="text-[10px] text-on-surface-variant">Draft</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user: clerkUser } = useUser();

  // Expandable row state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggleRow = (key: string) => setExpandedRow((prev) => (prev === key ? null : key));

  // Phone System & Carriers dialog state
  const [isTwilioDialogOpen, setIsTwilioDialogOpen] = useState(false);
  const [isCarriersDialogOpen, setIsCarriersDialogOpen] = useState(false);

  // Edit dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<UpdateOwnOrganizationData>({
    businessName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    ownerName: "",
    ownerEmail: "",
  });

  // Get the Convex organization
  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Get current Convex user
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id && convexOrg?._id
      ? { clerkUserId: clerkUser.id, organizationId: convexOrg._id }
      : "skip"
  );

  // Get users count
  const users = useQuery(
    api.users.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const isAdmin = convexUser?.role === "tenant_admin" || convexUser?.role === "supervisor";

  // Email accounts — admins see all org accounts, agents see only their own
  const allEmailAccounts = useQuery(
    api.emailAccounts.getByOrganization,
    isAdmin && convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );
  const myEmailAccounts = useQuery(
    api.emailAccounts.getByUser,
    !isAdmin && convexUser?._id ? { userId: convexUser._id } : "skip"
  );
  const emailAccounts = isAdmin ? allEmailAccounts : myEmailAccounts;
  const disconnectEmail = useMutation(api.emailAccounts.disconnect);
  const [isConnectingEmail, setIsConnectingEmail] = useState(false);
  const [connectingEmailForUserId, setConnectingEmailForUserId] = useState<string | null>(null);

  // Contact tags
  const contactTags = useQuery(
    api.contactTags.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );
  const createTag = useMutation(api.contactTags.create);
  const updateTag = useMutation(api.contactTags.update);
  const removeTag = useMutation(api.contactTags.remove);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("blue");

  // Workflows
  const workflows = useQuery(
    api.workflows.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  // User management state
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isUserSubmitting, setIsUserSubmitting] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userFormData, setUserFormData] = useState({
    name: "",
    email: "",
    role: "agent" as "tenant_admin" | "supervisor" | "agent",
    extension: "",
    agentCommissionSplit: "",
    agentRenewalSplit: "",
  });

  // User mutations
  const updateUser = useMutation(api.users.updateUser);
  const deleteUserMutation = useMutation(api.users.deleteUser);
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const saveUserAvatar = useMutation(api.users.saveUserAvatar);
  const deleteUserAvatar = useMutation(api.users.deleteUserAvatar);

  const resetUserForm = () => {
    setUserFormData({ name: "", email: "", role: "agent", extension: "", agentCommissionSplit: "", agentRenewalSplit: "" });
    setUserError(null);
  };

  const openUserEditDialog = (user: any) => {
    setUserFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      extension: user.extension || "",
      agentCommissionSplit: user.agentCommissionSplit != null ? String(user.agentCommissionSplit) : "",
      agentRenewalSplit: user.agentRenewalSplit != null ? String(user.agentRenewalSplit) : "",
    });
    setEditingUser(user);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    setIsUserSubmitting(true);
    setUserError(null);
    try {
      const result = await addUserToOrganization({
        clerkOrgId: organization.id,
        email: userFormData.email,
        name: userFormData.name,
        role: userFormData.role,
      });
      if (!result.success) {
        setUserError(result.error || "Failed to add user");
        return;
      }
      setIsAddUserOpen(false);
      resetUserForm();
    } catch (err: any) {
      setUserError(err.message || "Failed to create user.");
    } finally {
      setIsUserSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsUserSubmitting(true);
    try {
      await updateUser({
        userId: editingUser._id,
        name: userFormData.name,
        email: userFormData.email,
        role: userFormData.role,
        extension: userFormData.extension || undefined,
        agentCommissionSplit: userFormData.agentCommissionSplit ? parseFloat(userFormData.agentCommissionSplit) : undefined,
        agentRenewalSplit: userFormData.agentRenewalSplit ? parseFloat(userFormData.agentRenewalSplit) : undefined,
      });
      setEditingUser(null);
      resetUserForm();
    } catch (err: any) {
      setUserError(err.message || "Failed to update user.");
    } finally {
      setIsUserSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      if (organization?.id && user.clerkUserId && !user.clerkUserId.startsWith("manual_")) {
        await removeUserFromOrganization(organization.id, user.clerkUserId);
      }
      await deleteUserMutation({ userId: user._id });
    } catch (err) {
      console.error("Failed to delete user:", err);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!editingUser || !convexOrg?._id) return;
    const uploadUrl = await generateAvatarUploadUrl({ organizationId: convexOrg._id });
    const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
    if (!response.ok) throw new Error("Upload failed");
    const { storageId } = await response.json();
    await saveUserAvatar({ userId: editingUser._id, storageId });
    setEditingUser((prev: any) => prev ? { ...prev, avatarUrl: URL.createObjectURL(file) } : null);
  };

  const handleAvatarDelete = async () => {
    if (!editingUser) return;
    await deleteUserAvatar({ userId: editingUser._id });
    setEditingUser((prev: any) => prev ? { ...prev, avatarUrl: null } : null);
  };

  const handleConnectEmailForUser = async (userId: Id<"users">, provider: "google" | "microsoft") => {
    if (!convexOrg?._id) return;
    setConnectingEmailForUserId(userId);
    try {
      const res = await fetch("/api/email/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: convexOrg._id, userId, provider }),
      });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error("Failed to connect email:", err);
    } finally {
      setConnectingEmailForUserId(null);
    }
  };

  // Logo upload
  const logoUrl = useQuery(
    api.logoUpload.getLogoUrl,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );
  const generateLogoUploadUrl = useMutation(api.logoUpload.generateUploadUrl);
  const saveLogo = useMutation(api.logoUpload.saveLogo);
  const deleteLogo = useMutation(api.logoUpload.deleteLogo);

  const handleLogoUpload = async (file: File) => {
    if (!convexOrg?._id) return;
    const uploadUrl = await generateLogoUploadUrl({ organizationId: convexOrg._id });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Upload failed");
    const { storageId } = await response.json();
    await saveLogo({ organizationId: convexOrg._id, storageId });
  };

  const handleLogoDelete = async () => {
    if (!convexOrg?._id) return;
    await deleteLogo({ organizationId: convexOrg._id });
  };

  const searchParams = useSearchParams();
  const emailConnected = searchParams.get("email_connected");
  const emailError = searchParams.get("email_error");

  const handleConnectEmail = async (provider?: "google" | "microsoft") => {
    if (!convexOrg?._id) return;
    setIsConnectingEmail(true);
    try {
      const res = await fetch("/api/email/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: convexOrg._id, userId: convexUser?._id, provider }),
      });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        console.error("No auth URL returned:", data);
      }
    } catch (err) {
      console.error("Failed to connect email:", err);
    } finally {
      setIsConnectingEmail(false);
    }
  };

  const handleDisconnectEmail = async (emailAccountId: string) => {
    await disconnectEmail({ emailAccountId: emailAccountId as any });
  };

  const openEditDialog = () => {
    setFormData({
      businessName: convexOrg?.name || organization?.name || "",
      streetAddress: convexOrg?.businessInfo?.streetAddress || "",
      city: convexOrg?.businessInfo?.city || "",
      state: convexOrg?.businessInfo?.state || "",
      zip: convexOrg?.businessInfo?.zip || "",
      phone: convexOrg?.businessInfo?.phone || "",
      ownerName: convexOrg?.businessInfo?.ownerName || "",
      ownerEmail: convexOrg?.businessInfo?.ownerEmail || "",
    });
    setUpdateError(null);
    setUpdateSuccess(null);
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const result = await updateOwnOrganization(formData);
      if (result.success) {
        setUpdateSuccess(result.message || "Organization updated successfully!");
        setTimeout(() => {
          setIsEditOpen(false);
          setUpdateSuccess(null);
        }, 1500);
      } else {
        setUpdateError(result.error || "Failed to update organization");
      }
    } catch (error: any) {
      console.error("Failed to update organization:", error);
      setUpdateError(error.message || "Failed to update organization");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Organization Selected</CardTitle>
            <CardDescription>
              Please select an organization to manage settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const twilioConfigured = convexOrg?.settings?.twilioCredentials?.isConfigured ?? false;
  const a2pStatus = (convexOrg?.settings as any)?.a2pStatus || "none";

  // Billing
  const subscriptionStatus = (convexOrg?.billing as any)?.subscriptionStatus;

  const handleManageBilling = async () => {
    if (!convexOrg?._id) return;
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: convexOrg._id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Failed to open billing portal:", err);
    }
  };

  return (
    <PageContainer variant="settings">
      <PageHeader
        title={`Settings - ${organization.name}`}
        description="Manage your organization settings"
      />

      {/* Email connection alerts */}
      {emailConnected && (
        <Alert className="bg-green-500/10 border-green-500/20">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            Email account connected successfully!
          </AlertDescription>
        </Alert>
      )}
      {emailError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to connect email: {emailError}
          </AlertDescription>
        </Alert>
      )}

      {/* Settings Rows */}
      <div className="space-y-2">
        {/* Phone System */}
        <SettingsRow
          icon={<Phone className="h-4 w-4 text-red-600" />}
          label="Phone System"
          summary={twilioConfigured ? "Active" : "Not Set Up"}
          badge={twilioConfigured
            ? <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Active</Badge>
            : <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Not Set Up</Badge>
          }
          isExpanded={expandedRow === "twilio"}
          onToggle={() => toggleRow("twilio")}
        >
          {convexOrg?.settings?.twilioCredentials?.isAutoProvisioned ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Phone system is active and managed by your platform</p>
              </div>
              {convexOrg?._id && <PhoneNumbersManager organizationId={convexOrg._id} />}
            </>
          ) : twilioConfigured ? (
            <>
              <p className="text-sm text-on-surface-variant mb-3">Your phone system is configured and active.</p>
              {convexOrg?._id && <PhoneNumbersManager organizationId={convexOrg._id} />}
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">Contact your administrator to set up your phone system.</p>
          )}
        </SettingsRow>

        {/* SMS Compliance */}
        <SettingsRow
          icon={<MessageSquare className="h-4 w-4 text-green-600" />}
          label="SMS Compliance"
          summary={a2pStatus === "campaign_approved" ? "A2P Approved" : a2pStatus === "campaign_pending" ? "Under Review" : "Not Registered"}
          isExpanded={expandedRow === "sms-compliance"}
          onToggle={() => toggleRow("sms-compliance")}
        >
          {convexOrg?._id && <A2pRegistration organizationId={convexOrg._id} />}
        </SettingsRow>

        {/* Billing & Account */}
        <SettingsRow
          icon={<CreditCard className="h-4 w-4 text-green-600" />}
          label="Billing & Account"
          summary={subscriptionStatus === "active" ? "Active" : subscriptionStatus === "trialing" ? "Trial" : "Not set up"}
          isExpanded={expandedRow === "billing"}
          onToggle={() => toggleRow("billing")}
        >
          <div className="space-y-4">
            {/* Subscription Status */}
            <div>
              <h4 className="text-xs font-semibold mb-2">Subscription</h4>
              {subscriptionStatus === "active" && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Active</span>
                  {(convexOrg?.billing as any)?.currentPeriodEnd && (
                    <span className="text-xs text-on-surface-variant">· Renews {new Date((convexOrg?.billing as any)?.currentPeriodEnd).toLocaleDateString()}</span>
                  )}
                </div>
              )}
              {subscriptionStatus === "trialing" && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Free Trial</span>
                  {(convexOrg?.billing as any)?.trialEndsAt && (
                    <span className="text-xs text-on-surface-variant">· Ends {new Date((convexOrg?.billing as any)?.trialEndsAt).toLocaleDateString()}</span>
                  )}
                </div>
              )}
              {subscriptionStatus === "past_due" && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Payment Past Due — please update your payment method</span>
                </div>
              )}
              {!subscriptionStatus && (
                <p className="text-sm text-on-surface-variant">No active subscription.</p>
              )}
            </div>

            {/* Monthly Breakdown */}
            <div>
              <h4 className="text-xs font-semibold mb-2">Monthly Service</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span>Base plan (includes {convexOrg?.billing?.includedUsers || 1} user)</span>
                  <span className="font-semibold">${convexOrg?.billing?.basePlanPrice || 97}/mo</span>
                </div>
                {(users?.length ?? 0) > (convexOrg?.billing?.includedUsers || 1) && (
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Additional users ({(users?.length ?? 0) - (convexOrg?.billing?.includedUsers || 1)} x ${convexOrg?.billing?.perUserPrice || 47})</span>
                    <span>${((users?.length ?? 0) - (convexOrg?.billing?.includedUsers || 1)) * (convexOrg?.billing?.perUserPrice || 47)}/mo</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t pt-1.5 font-semibold">
                  <span>Subscription total</span>
                  <span>${(convexOrg?.billing?.basePlanPrice || 97) + Math.max(0, (users?.length ?? 0) - (convexOrg?.billing?.includedUsers || 1)) * (convexOrg?.billing?.perUserPrice || 47)}/mo</span>
                </div>
                <p className="text-[10px] text-on-surface-variant">Usage charges (calls, SMS, AI agents) billed separately based on actual usage.</p>
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <h4 className="text-xs font-semibold mb-2">Payment Method</h4>
              {(convexOrg?.billing as any)?.stripeCustomerId ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 flex-1">
                    <CreditCard className="h-4 w-4 text-on-surface-variant" />
                    <span className="text-sm">Card on file via Stripe</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleManageBilling}>
                    Update Card
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">No payment method on file.</p>
              )}
            </div>

            {/* Usage Invoices */}
            {convexOrg?._id && <TenantInvoiceHistory organizationId={convexOrg._id} />}

            {/* Manage Billing Portal */}
            {(convexOrg?.billing as any)?.stripeCustomerId && (
              <div className="border-t pt-3">
                <Button variant="outline" size="sm" onClick={handleManageBilling}>
                  Open Billing Portal
                </Button>
                <p className="text-[10px] text-on-surface-variant mt-1">
                  View invoices, update payment method, or cancel subscription in Stripe.
                </p>
              </div>
            )}
          </div>
        </SettingsRow>

        {/* Email & Calendar */}
        <SettingsRow
          icon={<Mail className="h-4 w-4 text-amber-600" />}
          label="Email & Calendar"
          summary={(() => {
            const active = emailAccounts?.filter((a) => a.status === "active") || [];
            return active.length > 0 ? `${active.length} account${active.length !== 1 ? "s" : ""} connected` : "Not connected";
          })()}
          badge={(() => {
            const active = emailAccounts?.filter((a) => a.status === "active") || [];
            return active.length > 0
              ? <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Connected</Badge>
              : <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Not Set Up</Badge>;
          })()}
          isExpanded={expandedRow === "email"}
          onToggle={() => toggleRow("email")}
        >
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant">
              Connect Gmail or Outlook to sync your calendar and send/receive emails from the CRM.
            </p>

            {/* Connected accounts */}
            {(emailAccounts || []).filter((a) => a.status !== "disconnected").length > 0 && (
              <div className="space-y-1.5">
                {(emailAccounts || []).filter((a) => a.status !== "disconnected").map((account) => {
                  const ownerUser = users?.find((u) => u._id === account.userId);
                  return (
                    <div key={account._id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                      <div className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md shrink-0 text-xs font-bold",
                        account.provider === "gmail" ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-blue-100 text-blue-600 dark:bg-blue-900/30"
                      )}>
                        {account.provider === "gmail" ? "G" : "O"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{account.email}</p>
                        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                          <span className="capitalize">{account.provider}</span>
                          {ownerUser && isAdmin && <span>· {ownerUser.name}</span>}
                          {account.status === "active" && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3 w-3" /> Active
                            </span>
                          )}
                          {account.status === "error" && (
                            <span className="flex items-center gap-1 text-red-500">
                              <AlertCircle className="h-3 w-3" /> Error
                            </span>
                          )}
                          {account.syncState && (
                            <span>· Calendar {account.syncState === "synced" ? "synced" : account.syncState === "syncing" ? "syncing..." : "error"}</span>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive shrink-0 h-7 w-7 p-0" onClick={() => handleDisconnectEmail(account._id)}>
                        <Unplug className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Connect buttons */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleConnectEmail("google")} disabled={isConnectingEmail}>
                {isConnectingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Connect Gmail
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleConnectEmail("microsoft")} disabled={isConnectingEmail}>
                {isConnectingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Connect Outlook
              </Button>
            </div>
          </div>
        </SettingsRow>

        {/* Users */}
        <SettingsRow
          icon={<Users className="h-4 w-4 text-blue-600" />}
          label="Users"
          summary={`${users?.length ?? 0} users`}
          badge={<Badge variant="secondary">{users?.length ?? 0} users</Badge>}
          isExpanded={expandedRow === "users"}
          onToggle={() => toggleRow("users")}
        >
          {!users ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-4 text-on-surface-variant">
              <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No users yet.</p>
              {isAdmin && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { resetUserForm(); setIsAddUserOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First User
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((u) => {
                const userEmail = emailAccounts?.find((a) => a.userId === u._id && a.status === "active");
                return (
                  <div key={u._id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={u.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">{u.name?.charAt(0) || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {u.role === "tenant_admin" ? "Admin" : u.role}
                        </Badge>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate">
                        {userEmail ? (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-green-600" />
                            {userEmail.email}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/60">No email connected</span>
                        )}
                      </p>
                    </div>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openUserEditDialog(u)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {!userEmail && (
                            <>
                              <DropdownMenuItem onClick={() => handleConnectEmailForUser(u._id, "google")}>
                                <Mail className="h-4 w-4 mr-2" />
                                Connect Gmail
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleConnectEmailForUser(u._id, "microsoft")}>
                                <Mail className="h-4 w-4 mr-2" />
                                Connect Outlook
                              </DropdownMenuItem>
                            </>
                          )}
                          {userEmail && (
                            <DropdownMenuItem onClick={() => handleDisconnectEmail(userEmail._id)}>
                              <Unplug className="h-4 w-4 mr-2" />
                              Disconnect Email
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteUser(u)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
              {isAdmin && (
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => { resetUserForm(); setIsAddUserOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              )}
            </div>
          )}
        </SettingsRow>

        {/* Tags */}
        {convexOrg?._id && (
          <SettingsRow
            icon={<Tag className="h-4 w-4 text-orange-600" />}
            label="Tags"
            summary={`${contactTags?.length ?? 0} tags`}
            isExpanded={expandedRow === "tags"}
            onToggle={() => toggleRow("tags")}
          >
            <div className="space-y-3">
              {/* Existing tags */}
              {contactTags && contactTags.length > 0 && (
                <div className="space-y-1.5">
                  {contactTags.map((tag) => (
                    <div key={tag._id} className="flex items-center gap-2 group">
                      <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", tagColors[tag.color]?.dot ?? "bg-gray-500")} />
                      <span className="text-sm flex-1">{tag.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {tag.isActive ? "Active" : "Off"}
                      </Badge>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => updateTag({ id: tag._id, isActive: !tag.isActive })}
                          className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                          title={tag.isActive ? "Deactivate" : "Activate"}
                        >
                          {tag.isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => removeTag({ id: tag._id })}
                          className="p-1 rounded text-on-surface-variant hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new tag */}
              <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name"
                  className="h-8 text-sm flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTagName.trim() && convexOrg?._id) {
                      createTag({ organizationId: convexOrg._id, name: newTagName.trim(), color: newTagColor });
                      setNewTagName("");
                    }
                  }}
                />
                <div className="flex items-center gap-1">
                  {TAG_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={cn(
                        "h-5 w-5 rounded-full transition-all",
                        tagColors[color]?.dot ?? "bg-gray-500",
                        newTagColor === color ? "ring-2 ring-offset-1 ring-primary scale-110" : "opacity-60 hover:opacity-100"
                      )}
                    />
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  disabled={!newTagName.trim()}
                  onClick={() => {
                    if (newTagName.trim() && convexOrg?._id) {
                      createTag({ organizationId: convexOrg._id, name: newTagName.trim(), color: newTagColor });
                      setNewTagName("");
                    }
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </SettingsRow>
        )}

        {/* Workflows - now a top-level page */}
        <Link href="/workflows">
          <SettingsRow
            icon={<Workflow className="h-4 w-4 text-cyan-600" />}
            label="Workflows"
            summary={`${workflows?.length ?? 0} workflows — Manage →`}
            isExpanded={false}
            onToggle={() => {}}
          />
        </Link>



        {/* Carriers */}
        <SettingsRow
          icon={<Briefcase className="h-4 w-4 text-purple-600" />}
          label="Carriers"
          summary="Lines of Business"
          isExpanded={expandedRow === "carriers"}
          onToggle={() => toggleRow("carriers")}
        >
          <p className="text-sm text-on-surface-variant mb-3">
            Select your carriers, lines of business, and configure commission rates.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setIsCarriersDialogOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Manage Carriers
          </Button>
        </SettingsRow>

        {/* Sales Goals */}
        {convexOrg?._id && (
          <SettingsRow
            icon={<Settings className="h-4 w-4 text-green-600" />}
            label="Sales Goals"
            summary="Daily, Weekly, Monthly targets"
            isExpanded={expandedRow === "goals"}
            onToggle={() => toggleRow("goals")}
          >
            <SalesGoalsManager organizationId={convexOrg._id} />
          </SettingsRow>
        )}

        {/* Agency Logo */}
        {convexOrg?._id && (
          <SettingsRow
            icon={<ImageIcon className="h-4 w-4 text-indigo-600" />}
            label="Agency Logo"
            summary={logoUrl ? "Custom logo uploaded" : "Using default"}
            isExpanded={expandedRow === "logo"}
            onToggle={() => toggleRow("logo")}
          >
            <ImageUpload
              currentImageUrl={logoUrl}
              onUpload={handleLogoUpload}
              onDelete={handleLogoDelete}
              label="Agency Logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              description="Upload your agency logo (PNG, JPG, WebP, SVG). Recommended size: 200x200px. Replaces the default VoIP CRM text in the header."
              previewShape="rounded"
              previewSize="h-12 w-auto max-w-[200px]"
            />
          </SettingsRow>
        )}

        {/* Agency Info */}
        <SettingsRow
          icon={<Building2 className="h-4 w-4 text-primary" />}
          label="Agency"
          summary="Business details"
          isExpanded={expandedRow === "org"}
          onToggle={() => toggleRow("org")}
        >
          {convexOrg?.businessInfo ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-on-surface-variant">Business Name</dt>
                <dd className="font-medium">{convexOrg.name}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Phone</dt>
                <dd className="font-medium">{convexOrg.businessInfo.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Owner</dt>
                <dd className="font-medium">{convexOrg.businessInfo.ownerName || "—"}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Owner Email</dt>
                <dd className="font-medium">{convexOrg.businessInfo.ownerEmail || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-on-surface-variant">Address</dt>
                <dd className="font-medium">
                  {convexOrg.businessInfo.streetAddress ? (
                    <>
                      {convexOrg.businessInfo.streetAddress}, {convexOrg.businessInfo.city}, {convexOrg.businessInfo.state} {convexOrg.businessInfo.zip}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="text-center py-4 text-on-surface-variant">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No business information on file.</p>
            </div>
          )}
          <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => openEditDialog()}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Agency Details
          </Button>
        </SettingsRow>

        {/* Hold Music */}
        {convexOrg?._id && (
          <SettingsRow
            icon={<Music className="h-4 w-4 text-teal-600" />}
            label="Hold Music"
            summary="Custom hold music"
            isExpanded={expandedRow === "holdmusic"}
            onToggle={() => toggleRow("holdmusic")}
          >
            <HoldMusicUpload organizationId={convexOrg._id} />
          </SettingsRow>
        )}

        {convexOrg?._id && (
          <TenantDispositionsRow
            organizationId={convexOrg._id}
            isExpanded={expandedRow === "call-dispositions"}
            onToggle={() => toggleRow("call-dispositions")}
          />
        )}
      </div>

      {/* Edit Organization Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        if (!open) {
          setUpdateError(null);
          setUpdateSuccess(null);
        }
        setIsEditOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Organization Info</DialogTitle>
            <DialogDescription>
              Update your business contact details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate}>
            {updateError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{updateError}</AlertDescription>
              </Alert>
            )}
            {updateSuccess && (
              <Alert className="mb-4 bg-primary/10 border-primary/20">
                <CheckCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-foreground">{updateSuccess}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4 py-4">
              {/* Business Information */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    placeholder="Your Business Name"
                    value={formData.businessName}
                    onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="streetAddress">Street Address *</Label>
                  <Input
                    id="streetAddress"
                    placeholder="123 Main Street"
                    value={formData.streetAddress}
                    onChange={(e) => setFormData(prev => ({ ...prev, streetAddress: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                </div>
                <div className="grid grid-cols-6 gap-4">
                  <div className="col-span-3 space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      placeholder="Los Angeles"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      required
                      disabled={isUpdating || !!updateSuccess}
                    />
                  </div>
                  <div className="col-span-1 space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      placeholder="CA"
                      maxLength={2}
                      value={formData.state}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                      required
                      disabled={isUpdating || !!updateSuccess}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="zip">ZIP Code *</Label>
                    <Input
                      id="zip"
                      placeholder="90001"
                      value={formData.zip}
                      onChange={(e) => setFormData(prev => ({ ...prev, zip: e.target.value }))}
                      required
                      disabled={isUpdating || !!updateSuccess}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Business Phone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                </div>
              </div>

              {/* Owner Information */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-on-surface-variant">Owner Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Owner Name *</Label>
                  <Input
                    id="ownerName"
                    placeholder="John Smith"
                    value={formData.ownerName}
                    onChange={(e) => setFormData(prev => ({ ...prev, ownerName: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerEmail">Owner Email *</Label>
                  <Input
                    id="ownerEmail"
                    type="email"
                    placeholder="owner@example.com"
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, ownerEmail: e.target.value }))}
                    required
                    disabled={isUpdating || !!updateSuccess}
                  />
                  <p className="text-xs text-on-surface-variant">
                    This is your business contact email for billing and communication purposes.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditOpen(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating || !!updateSuccess}>
                {isUpdating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : updateSuccess ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Saved!
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Add a new team member. They will receive an email invitation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddUser}>
            {userError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{userError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="add-name">Name</Label>
                <Input id="add-name" placeholder="John Smith" value={userFormData.name} onChange={(e) => setUserFormData(prev => ({ ...prev, name: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-email">Email</Label>
                <Input id="add-email" type="email" placeholder="john@example.com" value={userFormData.email} onChange={(e) => setUserFormData(prev => ({ ...prev, email: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-role">Role</Label>
                <select id="add-role" className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm" value={userFormData.role} onChange={(e) => setUserFormData(prev => ({ ...prev, role: e.target.value as any }))}>
                  <option value="agent">Agent</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="tenant_admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-extension">Extension (Optional)</Label>
                <Input id="add-extension" placeholder="101" value={userFormData.extension} onChange={(e) => setUserFormData(prev => ({ ...prev, extension: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-commission">Agent Commission %</Label>
                <Input id="add-commission" type="number" min="0" max="100" step="0.5" placeholder="e.g. 50" value={userFormData.agentCommissionSplit} onChange={(e) => setUserFormData(prev => ({ ...prev, agentCommissionSplit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-renewal">Agent Renewal %</Label>
                <Input id="add-renewal" type="number" min="0" max="100" step="0.5" placeholder="e.g. 50" value={userFormData.agentRenewalSplit} onChange={(e) => setUserFormData(prev => ({ ...prev, agentRenewalSplit: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isUserSubmitting}>
                {isUserSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditUser}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Profile Photo</Label>
                <ImageUpload
                  currentImageUrl={editingUser?.avatarUrl}
                  onUpload={handleAvatarUpload}
                  onDelete={handleAvatarDelete}
                  label="Profile Photo"
                  description="Upload a profile photo (PNG, JPG)."
                  previewShape="circle"
                  previewSize="h-16 w-16"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" value={userFormData.name} onChange={(e) => setUserFormData(prev => ({ ...prev, name: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" value={userFormData.email} onChange={(e) => setUserFormData(prev => ({ ...prev, email: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <select id="edit-role" className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm" value={userFormData.role} onChange={(e) => setUserFormData(prev => ({ ...prev, role: e.target.value as any }))}>
                  <option value="agent">Agent</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="tenant_admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-extension">Extension</Label>
                <Input id="edit-extension" value={userFormData.extension} onChange={(e) => setUserFormData(prev => ({ ...prev, extension: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-commission">Agent Commission %</Label>
                <Input id="edit-commission" type="number" min="0" max="100" step="0.5" placeholder="e.g. 50" value={userFormData.agentCommissionSplit} onChange={(e) => setUserFormData(prev => ({ ...prev, agentCommissionSplit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-renewal">Agent Renewal %</Label>
                <Input id="edit-renewal" type="number" min="0" max="100" step="0.5" placeholder="e.g. 50" value={userFormData.agentRenewalSplit} onChange={(e) => setUserFormData(prev => ({ ...prev, agentRenewalSplit: e.target.value }))} />
              </div>
              {/* Email connection in edit dialog */}
              <div className="space-y-2 pt-2 border-t">
                <Label>Email / Calendar</Label>
                {(() => {
                  const userEmailAccount = emailAccounts?.find((a) => a.userId === editingUser?._id && a.status === "active");
                  const isConnecting = connectingEmailForUserId === editingUser?._id;
                  return userEmailAccount ? (
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{userEmailAccount.email}</p>
                        <p className="text-xs text-on-surface-variant capitalize">{userEmailAccount.provider}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDisconnectEmail(userEmailAccount._id)}>
                        <Unplug className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => editingUser && handleConnectEmailForUser(editingUser._id, "google")} disabled={isConnecting}>
                        {isConnecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                        Connect Gmail
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => editingUser && handleConnectEmailForUser(editingUser._id, "microsoft")} disabled={isConnecting}>
                        {isConnecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                        Connect Outlook
                      </Button>
                    </div>
                  );
                })()}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button type="submit" disabled={isUserSubmitting}>
                {isUserSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Phone System Settings Dialog */}
      {convexOrg?._id && (
        <TwilioSettingsDialog
          open={isTwilioDialogOpen}
          onOpenChange={setIsTwilioDialogOpen}
          organizationId={convexOrg._id}
        />
      )}

      {/* Carriers Settings Dialog */}
      {convexOrg?._id && organization?.id && (
        <CarriersSettingsDialog
          open={isCarriersDialogOpen}
          onOpenChange={setIsCarriersDialogOpen}
          organizationId={convexOrg._id}
          clerkOrgId={organization.id}
          initialAgencyTypeId={convexOrg.agencyTypeId}
        />
      )}
    </PageContainer>
  );
}

/**
 * Per-tenant opt-in toggles for platform-defined call dispositions. Shown in
 * the tenant Settings page. Defaults to "all platform-active dispositions
 * enabled" when no overrides exist, so a new tenant doesn't end up with an
 * empty disposition picker on the first call.
 */
function TenantDispositionsRow({
  organizationId,
  isExpanded,
  onToggle,
}: {
  organizationId: import("../../../../convex/_generated/dataModel").Id<"organizations">;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const dispositions = useQuery(api.callDispositions.listTenant, { organizationId });
  const setEnabled = useMutation(api.callDispositions.tenantSetEnabled);

  const enabledCount = (dispositions ?? []).filter((d: any) => d.enabled).length;
  const total = dispositions?.length ?? 0;

  return (
    <SettingsRow
      icon={<Phone className="h-4 w-4 text-emerald-600" />}
      label="Call Dispositions"
      summary={`${enabledCount} of ${total} enabled`}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      {dispositions === undefined ? (
        <p className="text-xs text-on-surface-variant py-2">Loading…</p>
      ) : dispositions.length === 0 ? (
        <p className="text-xs text-on-surface-variant py-2">
          Your platform admin hasn't configured any dispositions yet.
        </p>
      ) : (
        <div className="space-y-1">
          {dispositions.map((d: any) => (
            <label
              key={d._id}
              className="flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-surface-container-high/50 cursor-pointer -mx-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{d.label}</span>
                {d.category && (
                  <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                    {d.category.replace("_", " ")}
                  </span>
                )}
              </div>
              <input
                type="checkbox"
                checked={d.enabled}
                onChange={(e) =>
                  setEnabled({
                    organizationId,
                    dispositionId: d._id,
                    enabled: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-primary"
              />
            </label>
          ))}
        </div>
      )}
    </SettingsRow>
  );
}
