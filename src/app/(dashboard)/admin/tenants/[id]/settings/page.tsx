"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
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
  Phone, Users, Settings, CheckCircle, XCircle, Loader2,
  ArrowLeft, Eye, Building2, Pencil, AlertCircle, Mail, Unplug, Trash2, Plus, Briefcase,
  Music, ImageIcon, UserPlus, MoreHorizontal, Tag, Workflow, MessageSquare
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { updateTenant, UpdateTenantData, addUserToOrganization, removeUserFromOrganization } from "../../../actions";
import { HoldMusicUpload } from "@/components/settings/hold-music-upload";
import { SalesGoalsManager } from "@/components/settings/sales-goals-manager";
import { ImageUpload } from "@/components/settings/image-upload";
import { SettingsRow } from "@/components/settings/settings-row";
import { TwilioSettingsDialog } from "@/components/settings/twilio-settings-dialog";
import { CarriersSettingsDialog } from "@/components/settings/carriers-settings-dialog";
import { PhoneNumbersManager } from "@/components/settings/phone-numbers-manager";
import { tagColors, TAG_COLOR_OPTIONS } from "@/lib/style-constants";
import { A2pRegistration } from "@/components/settings/a2p-registration";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function TenantSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const tenantId = params.id as string;

  // Check if user is a platform admin
  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Get the tenant organization by ID
  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  // Get users count
  const users = useQuery(
    api.users.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  // Email accounts for this tenant
  const emailAccounts = useQuery(
    api.emailAccounts.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );
  const disconnectEmail = useMutation(api.emailAccounts.disconnect);
  const removeEmail = useMutation(api.emailAccounts.remove);
  const [deletingEmailAccount, setDeletingEmailAccount] = useState<any>(null);

  // Contact tags
  const contactTags = useQuery(
    api.contactTags.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );
  const createTag = useMutation(api.contactTags.create);
  const updateTag = useMutation(api.contactTags.update);
  const removeTag = useMutation(api.contactTags.remove);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("blue");

  // Workflows
  const workflows = useQuery(
    api.workflows.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  // Phone System & Carriers dialog state
  const [isTwilioDialogOpen, setIsTwilioDialogOpen] = useState(false);
  const [isCarriersDialogOpen, setIsCarriersDialogOpen] = useState(false);

  // Logo upload
  const logoUrl = useQuery(
    api.logoUpload.getLogoUrl,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );
  const generateLogoUploadUrl = useMutation(api.logoUpload.generateUploadUrl);
  const saveLogo = useMutation(api.logoUpload.saveLogo);
  const deleteLogo = useMutation(api.logoUpload.deleteLogo);

  const handleLogoUpload = async (file: File) => {
    if (!tenant?._id) return;
    const uploadUrl = await generateLogoUploadUrl({ organizationId: tenant._id });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Upload failed");
    const { storageId } = await response.json();
    await saveLogo({ organizationId: tenant._id, storageId });
  };

  const handleLogoDelete = async () => {
    if (!tenant?._id) return;
    await deleteLogo({ organizationId: tenant._id });
  };

  // Expandable row state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggleRow = (key: string) => setExpandedRow((prev) => (prev === key ? null : key));

  // Edit dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<UpdateTenantData>({
    organizationId: "" as Id<"organizations">,
    businessName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    ownerName: "",
    ownerEmail: "",
    basePlanPrice: 0,
    perUserPrice: 0,
    includedUsers: 1,
  });

  const [connectingForUserId, setConnectingForUserId] = useState<string | null>(null);

  const handleConnectEmailForUser = async (userId: Id<"users">, provider: "google" | "microsoft") => {
    if (!tenant?._id) return;
    setConnectingForUserId(userId);
    try {
      const res = await fetch("/api/email/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: tenant._id,
          userId,
          redirectUri: `${window.location.origin}/api/email/callback`,
          provider,
          redirectPath: `/admin/tenants/${tenant._id}/settings`,
        }),
      });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error("Failed to connect email:", err);
    } finally {
      setConnectingForUserId(null);
    }
  };

  const handleDeleteEmailAccount = async () => {
    if (!deletingEmailAccount) return;
    try {
      await removeEmail({ emailAccountId: deletingEmailAccount._id });
      setDeletingEmailAccount(null);
    } catch (err) {
      console.error("Failed to delete email account:", err);
    }
  };

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

  const updateUser = useMutation(api.users.updateUser);
  const deleteUserMutation = useMutation(api.users.deleteUser);
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const saveUserAvatar = useMutation(api.users.saveUserAvatar);
  const deleteUserAvatar = useMutation(api.users.deleteUserAvatar);

  const resetUserForm = () => {
    setUserFormData({ name: "", email: "", role: "agent", extension: "", agentCommissionSplit: "", agentRenewalSplit: "" });
    setUserError(null);
  };

  const openUserEditDialog = (u: any) => {
    setUserFormData({
      name: u.name,
      email: u.email,
      role: u.role,
      extension: u.extension || "",
      agentCommissionSplit: u.agentCommissionSplit != null ? String(u.agentCommissionSplit) : "",
      agentRenewalSplit: u.agentRenewalSplit != null ? String(u.agentRenewalSplit) : "",
    });
    setEditingUser(u);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.clerkOrgId) return;
    setIsUserSubmitting(true);
    setUserError(null);
    try {
      const result = await addUserToOrganization({
        clerkOrgId: tenant.clerkOrgId,
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

  const handleDeleteUser = async (u: any) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      if (tenant?.clerkOrgId && u.clerkUserId && !u.clerkUserId.startsWith("manual_")) {
        await removeUserFromOrganization(tenant.clerkOrgId, u.clerkUserId);
      }
      await deleteUserMutation({ userId: u._id });
    } catch (err) {
      console.error("Failed to delete user:", err);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!editingUser || !tenant?._id) return;
    const uploadUrl = await generateAvatarUploadUrl({ organizationId: tenant._id });
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

  const openEditDialog = () => {
    if (!tenant) return;
    setFormData({
      organizationId: tenant._id,
      businessName: tenant.name || "",
      streetAddress: tenant.businessInfo?.streetAddress || "",
      city: tenant.businessInfo?.city || "",
      state: tenant.businessInfo?.state || "",
      zip: tenant.businessInfo?.zip || "",
      phone: tenant.businessInfo?.phone || "",
      ownerName: tenant.businessInfo?.ownerName || "",
      ownerEmail: tenant.businessInfo?.ownerEmail || "",
      basePlanPrice: tenant.billing?.basePlanPrice ?? 0,
      perUserPrice: tenant.billing?.perUserPrice ?? 0,
      includedUsers: tenant.billing?.includedUsers ?? 1,
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
      const result = await updateTenant(formData);
      if (result.success) {
        setUpdateSuccess(result.message || "Tenant updated successfully!");
        setTimeout(() => {
          setIsEditOpen(false);
          setUpdateSuccess(null);
        }, 1500);
      } else {
        setUpdateError(result.error || "Failed to update tenant");
      }
    } catch (error: any) {
      console.error("Failed to update tenant:", error);
      setUpdateError(error.message || "Failed to update tenant");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!userLoaded || isPlatformUser === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  // Only platform users can access this page
  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access tenant settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tenant === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (tenant === null) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Tenant Not Found</CardTitle>
            <CardDescription>
              The tenant organization you're looking for doesn't exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin">
              <Button className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const twilioConfigured = tenant?.settings?.twilioCredentials?.isConfigured ?? false;
  const a2pStatus = (tenant?.settings as any)?.a2pStatus || "none";

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--header-height))]">
      <div className="p-6 max-w-4xl mx-auto space-y-6 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Tenant Settings</h1>
            <p className="text-on-surface-variant">
              Manage settings for {tenant.name}
            </p>
          </div>
          <Link href={`/admin/tenants/${tenant._id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

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
            {(tenant?.settings as any)?.twilioCredentials?.isAutoProvisioned ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Phone system active — auto-provisioned</p>
                </div>
                {tenant?._id && <PhoneNumbersManager organizationId={tenant._id} />}
              </>
            ) : twilioConfigured ? (
              <>
                <p className="text-sm text-on-surface-variant mb-3">Phone system is configured.</p>
                <Button variant="outline" size="sm" className="w-full mb-3" onClick={() => setIsTwilioDialogOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Credentials
                </Button>
                {tenant?._id && <PhoneNumbersManager organizationId={tenant._id} />}
              </>
            ) : (
              <>
                <p className="text-sm text-on-surface-variant mb-3">Phone system not set up for this tenant.</p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setIsTwilioDialogOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Set Up Manually
                </Button>
              </>
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
            {tenant?._id && <A2pRegistration organizationId={tenant._id} />}
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
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { resetUserForm(); setIsAddUserOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First User
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {users.map((u) => {
                  const userEmail = emailAccounts?.find((a) => a.userId === u._id && a.status === "active");
                  return (
                    <div key={u._id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
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
                            <DropdownMenuItem onClick={() => disconnectEmail({ emailAccountId: userEmail._id })}>
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
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => { resetUserForm(); setIsAddUserOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </div>
            )}
          </SettingsRow>

          {/* Tags */}
          {tenant?._id && (
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
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Tag name"
                    className="h-8 text-sm flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagName.trim() && tenant?._id) {
                        createTag({ organizationId: tenant._id, name: newTagName.trim(), color: newTagColor });
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
                      if (newTagName.trim() && tenant?._id) {
                        createTag({ organizationId: tenant._id, name: newTagName.trim(), color: newTagColor });
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
          <Link href={`/admin/tenants/${tenantId}/workflows`}>
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
              Configure carriers, lines of business, and commission rates for this tenant.
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setIsCarriersDialogOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Manage Carriers
            </Button>
          </SettingsRow>

          {/* Sales Goals */}
          {tenant?._id && (
            <SettingsRow
              icon={<Settings className="h-4 w-4 text-green-600" />}
              label="Sales Goals"
              summary="Daily, Weekly, Monthly targets"
              isExpanded={expandedRow === "goals"}
              onToggle={() => toggleRow("goals")}
            >
              <SalesGoalsManager organizationId={tenant._id} />
            </SettingsRow>
          )}

          {/* Agency Logo */}
          {tenant._id && (
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
              description="Upload the agency logo (PNG, JPG, WebP, SVG). Recommended size: 200x200px. Replaces the default VoIP CRM text in the header."
                previewShape="rounded"
                previewSize="h-12 w-auto max-w-[200px]"
              />
            </SettingsRow>
          )}

          {/* Agency Details */}
          <SettingsRow
            icon={<Building2 className="h-4 w-4 text-primary" />}
            label="Agency"
            summary={`${tenant.plan ?? "free"} plan`}
            badge={<Badge variant="secondary">{tenant.plan ?? "free"}</Badge>}
            isExpanded={expandedRow === "org"}
            onToggle={() => toggleRow("org")}
          >
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-on-surface-variant">Name</dt>
                <dd className="font-medium">{tenant.name}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Max Concurrent Calls</dt>
                <dd className="font-medium">{tenant.settings?.maxConcurrentCalls ?? 5}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Recording</dt>
                <dd className="font-medium">{tenant.settings?.recordingEnabled ? "Enabled" : "Disabled"}</dd>
              </div>
              {tenant.businessInfo && (
                <>
                  <div>
                    <dt className="text-on-surface-variant">Owner</dt>
                    <dd className="font-medium">{tenant.businessInfo.ownerName}</dd>
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">Owner Email</dt>
                    <dd className="font-medium">{tenant.businessInfo.ownerEmail}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-on-surface-variant">Address</dt>
                    <dd className="font-medium">
                      {tenant.businessInfo.streetAddress}, {tenant.businessInfo.city}, {tenant.businessInfo.state} {tenant.businessInfo.zip}
                    </dd>
                  </div>
                </>
              )}
              {tenant.billing && (
                <>
                  <div>
                    <dt className="text-on-surface-variant">Base Plan Price</dt>
                    <dd className="font-medium">${tenant.billing.basePlanPrice}/mo</dd>
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">Per User Price</dt>
                    <dd className="font-medium">${tenant.billing.perUserPrice}/mo</dd>
                  </div>
                </>
              )}
            </dl>
            <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => openEditDialog()}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Agency Details
            </Button>
          </SettingsRow>

          {/* Hold Music */}
          {tenant._id && (
            <SettingsRow
              icon={<Music className="h-4 w-4 text-teal-600" />}
              label="Hold Music"
              summary="Custom hold music"
              isExpanded={expandedRow === "holdmusic"}
              onToggle={() => toggleRow("holdmusic")}
            >
              <HoldMusicUpload organizationId={tenant._id} />
            </SettingsRow>
          )}
        </div>
      </div>

      {/* Delete Email Account Dialog */}
      <Dialog open={!!deletingEmailAccount} onOpenChange={(open) => { if (!open) setDeletingEmailAccount(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Email Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{deletingEmailAccount?.email}</strong>? This will remove the account and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingEmailAccount(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteEmailAccount}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        if (!open) {
          setUpdateError(null);
          setUpdateSuccess(null);
        }
        setIsEditOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Tenant Details</DialogTitle>
            <DialogDescription>
              Update business and billing information for this tenant.
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
                <AlertDescription className="text-on-surface">{updateSuccess}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4 py-4">
              {/* Business Information */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-on-surface-variant">Business Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    placeholder="Business Name"
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
              <div className="space-y-4 pt-4">
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
                </div>
              </div>

              {/* Billing Information */}
              <div className="space-y-4 pt-4">
                <h3 className="font-medium text-sm text-on-surface-variant">Billing (Platform Admin Only)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="basePlanPrice">Base Plan Price</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
                      <Input
                        id="basePlanPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="pl-7"
                        value={formData.basePlanPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, basePlanPrice: parseFloat(e.target.value) || 0 }))}
                        disabled={isUpdating || !!updateSuccess}
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant">per month</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="perUserPrice">Per User Price</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
                      <Input
                        id="perUserPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="pl-7"
                        value={formData.perUserPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, perUserPrice: parseFloat(e.target.value) || 0 }))}
                        disabled={isUpdating || !!updateSuccess}
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant">per month</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="includedUsers">Included Users</Label>
                    <Input
                      id="includedUsers"
                      type="number"
                      min="1"
                      placeholder="1"
                      value={formData.includedUsers}
                      onChange={(e) => setFormData(prev => ({ ...prev, includedUsers: parseInt(e.target.value) || 1 }))}
                      disabled={isUpdating || !!updateSuccess}
                    />
                    <p className="text-xs text-on-surface-variant">users included</p>
                  </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Add a new team member to {tenant?.name}. They will receive an email invitation.
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
                <select id="add-role" className="flex h-9 w-full rounded-xl border border-input bg-surface-container-lowest px-3 py-1 text-sm" value={userFormData.role} onChange={(e) => setUserFormData(prev => ({ ...prev, role: e.target.value as any }))}>
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
        <DialogContent>
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
                <select id="edit-role" className="flex h-9 w-full rounded-xl border border-input bg-surface-container-lowest px-3 py-1 text-sm" value={userFormData.role} onChange={(e) => setUserFormData(prev => ({ ...prev, role: e.target.value as any }))}>
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
              <div className="space-y-2 pt-2">
                <Label>Email / Calendar</Label>
                {(() => {
                  const userEmailAccount = emailAccounts?.find((a) => a.userId === editingUser?._id && a.status === "active");
                  const isConnecting = connectingForUserId === editingUser?._id;
                  return userEmailAccount ? (
                    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{userEmailAccount.email}</p>
                        <p className="text-xs text-on-surface-variant capitalize">{userEmailAccount.provider}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => disconnectEmail({ emailAccountId: userEmailAccount._id })}>
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
      {tenant?._id && (
        <TwilioSettingsDialog
          open={isTwilioDialogOpen}
          onOpenChange={setIsTwilioDialogOpen}
          organizationId={tenant._id}
        />
      )}

      {/* Carriers Settings Dialog */}
      {tenant?._id && tenant?.clerkOrgId && (
        <CarriersSettingsDialog
          open={isCarriersDialogOpen}
          onOpenChange={setIsCarriersDialogOpen}
          organizationId={tenant._id}
          clerkOrgId={tenant.clerkOrgId}
          initialAgencyTypeId={tenant.agencyTypeId}
        />
      )}
    </div>
  );
}
