"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  ChevronRight, Users, Loader2, ArrowLeft, Eye, Mail, Shield, Phone,
  Plus, MoreHorizontal, Pencil, Trash2, UserPlus, AlertCircle
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function TenantUsersSettingsPage() {
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

  // Get users for this tenant
  const users = useQuery(
    api.users.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  // Mutations
  const createUser = useMutation(api.users.createUser);
  const updateUser = useMutation(api.users.updateUser);
  const deleteUser = useMutation(api.users.deleteUser);
  const toggleStatus = useMutation(api.users.toggleStatus);

  // Dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "agent" as "tenant_admin" | "supervisor" | "agent",
    extension: "",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      role: "agent",
      extension: "",
    });
    setError(null);
  };

  const openEditDialog = (u: any) => {
    setFormData({
      name: u.name || "",
      email: u.email || "",
      role: u.role,
      extension: u.extension || "",
    });
    setEditingUser(u);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?._id) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await createUser({
        organizationId: tenant._id,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        extension: formData.extension || undefined,
      });
      setIsAddDialogOpen(false);
      resetForm();
    } catch (err: any) {
      console.error("Failed to create user:", err);
      setError(err.message || "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await updateUser({
        userId: editingUser._id,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        extension: formData.extension || undefined,
      });
      setEditingUser(null);
      resetForm();
    } catch (err: any) {
      console.error("Failed to update user:", err);
      setError(err.message || "Failed to update user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: Id<"users">) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      await deleteUser({ userId });
    } catch (err) {
      console.error("Failed to delete user:", err);
    }
  };

  const handleToggleStatus = async (userId: Id<"users">) => {
    try {
      await toggleStatus({ userId });
    } catch (err) {
      console.error("Failed to toggle status:", err);
    }
  };

  if (!userLoaded || isPlatformUser === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Only platform users can access this page
  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
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
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenant === null) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
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

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "tenant_admin":
        return "default";
      case "supervisor":
        return "secondary";
      case "agent":
        return "outline";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "tenant_admin":
        return "Admin";
      case "supervisor":
        return "Supervisor";
      case "agent":
        return "Agent";
      default:
        return role;
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Impersonation Banner */}
      <Alert className="rounded-none border-x-0 border-t-0 bg-amber-500/10 border-amber-500/20">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-400">
            <strong>Managing:</strong> {tenant.name} Users
          </span>
          <div className="flex gap-2">
            <Link href={`/admin/tenants/${tenant._id}/settings`}>
              <Button variant="outline" size="sm" className="border-amber-500/30 hover:bg-amber-500/10">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Settings
              </Button>
            </Link>
          </div>
        </AlertDescription>
      </Alert>

      <div className="p-6 max-w-4xl mx-auto space-y-6 flex-1">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground transition-colors">
            Admin
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link href={`/admin/tenants/${tenant._id}`} className="hover:text-foreground transition-colors">
            {tenant.name}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link href={`/admin/tenants/${tenant._id}/settings`} className="hover:text-foreground transition-colors">
            Settings
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">Users</span>
        </nav>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Team Members</h1>
            <p className="text-muted-foreground">
              Manage users for {tenant.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-base px-3 py-1">
              {users?.length ?? 0} users
            </Badge>
            <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>All Users</CardTitle>
                <CardDescription>
                  Users belonging to this tenant organization
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {users && users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Extension</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u._id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.avatarUrl} alt={u.name || "User"} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {u.name
                                ? u.name.split(" ").map(n => n[0]).join("").toUpperCase()
                                : u.email?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{u.name || "Unknown User"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {u.email || "No email"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(u.role)} className="gap-1">
                          <Shield className="h-3 w-3" />
                          {getRoleLabel(u.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.status !== "offline" ? "default" : "secondary"}
                          className={u.status !== "offline" ? "bg-green-600" : ""}
                        >
                          {u.status === "offline" ? "Offline" : u.status === "available" ? "Available" : u.status === "busy" ? "Busy" : "Away"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.extension ? (
                          <span className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {u.extension}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.status !== "offline"}
                          onCheckedChange={() => handleToggleStatus(u._id)}
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(u)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteUser(u._id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No users found for this organization.</p>
                <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }} className="mt-4">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add First User
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role Breakdown */}
        {users && users.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Role Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold text-primary">
                    {users.filter(u => u.role === "tenant_admin").length}
                  </p>
                  <p className="text-sm text-muted-foreground">Admins</p>
                </div>
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">
                    {users.filter(u => u.role === "supervisor").length}
                  </p>
                  <p className="text-sm text-muted-foreground">Supervisors</p>
                </div>
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {users.filter(u => u.role === "agent").length}
                  </p>
                  <p className="text-sm text-muted-foreground">Agents</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Add a new team member to {tenant?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddUser}>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="John Smith"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
                >
                  <option value="agent">Agent</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="tenant_admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="extension">Extension (Optional)</Label>
                <Input
                  id="extension"
                  placeholder="101"
                  value={formData.extension}
                  onChange={(e) => setFormData(prev => ({ ...prev, extension: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user details
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditUser}>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <select
                  id="edit-role"
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
                >
                  <option value="agent">Agent</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="tenant_admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-extension">Extension (Optional)</Label>
                <Input
                  id="edit-extension"
                  value={formData.extension}
                  onChange={(e) => setFormData(prev => ({ ...prev, extension: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
