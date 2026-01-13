"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ChevronRight, Users, Loader2, Plus, MoreHorizontal, Pencil, Trash2, UserPlus, AlertCircle, Mail } from "lucide-react";
import Link from "next/link";
import { Id } from "../../../../../convex/_generated/dataModel";
import { addUserToOrganization, removeUserFromOrganization } from "../../admin/actions";

export default function UsersSettingsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for new/edit user
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "agent" as "tenant_admin" | "supervisor" | "agent",
    extension: "",
  });

  // Get the Convex organization
  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Get users
  const users = useQuery(
    api.users.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  // Mutations
  const updateUser = useMutation(api.users.updateUser);
  const deleteUserMutation = useMutation(api.users.deleteUser);
  const toggleStatus = useMutation(api.users.toggleStatus);

  // State for success messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!organization?.id) {
      setError("No organization selected. Please select an organization first.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Use server action to add user via Clerk
      // This ensures they get a real Clerk ID and can receive calls
      const result = await addUserToOrganization({
        clerkOrgId: organization.id,
        email: formData.email,
        name: formData.name,
        role: formData.role,
      });

      if (!result.success) {
        setError(result.error || "Failed to add user");
        return;
      }

      setSuccessMessage(result.message || "User added successfully");
      setIsAddDialogOpen(false);
      resetForm();
    } catch (err: any) {
      console.error("Failed to create user:", err);
      setError(err.message || "Failed to create user. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
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
    } catch (error) {
      console.error("Failed to update user:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      // If it's a real Clerk user (not manual_), remove from Clerk first
      if (organization?.id && user.clerkUserId && !user.clerkUserId.startsWith("manual_")) {
        const result = await removeUserFromOrganization(organization.id, user.clerkUserId);
        if (!result.success) {
          console.error("Failed to remove from Clerk:", result.error);
          // Still try to delete from Convex
        }
      }

      // Delete from Convex
      await deleteUserMutation({ userId: user._id });
    } catch (error) {
      console.error("Failed to delete user:", error);
    }
  };

  const handleToggleStatus = async (userId: Id<"users">) => {
    try {
      await toggleStatus({ userId });
    } catch (error) {
      console.error("Failed to toggle user status:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      role: "agent",
      extension: "",
    });
  };

  const openEditDialog = (user: any) => {
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      extension: user.extension || "",
    });
    setEditingUser(user);
  };

  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Organization Selected</CardTitle>
            <CardDescription>
              Please select an organization to manage users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    tenant_admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30",
    supervisor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30",
    agent: "bg-gray-100 text-gray-700 dark:bg-gray-900/30",
  };

  const statusColors: Record<string, string> = {
    available: "bg-green-100 text-green-700 dark:bg-green-900/30",
    busy: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30",
    on_call: "bg-blue-100 text-blue-700 dark:bg-blue-900/30",
    on_break: "bg-orange-100 text-orange-700 dark:bg-orange-900/30",
    offline: "bg-gray-100 text-gray-500 dark:bg-gray-900/30",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/settings" className="hover:text-foreground transition-colors">
          Settings
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">Users</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage your team members and their roles
          </p>
        </div>

        {/* Add User Button */}
        <Button onClick={() => { resetForm(); setError(null); setIsAddDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Add a new team member to your organization. They will receive an email invitation if they don't have an account yet.
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

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                {users?.length ?? 0} users in {organization.name}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!users || users.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No Users Yet</h3>
              <p className="text-muted-foreground mb-4">
                Add team members to see them on the calling dashboard
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add First User
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={roleColors[user.role]}>
                        {user.role === "tenant_admin" ? "Admin" : user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColors[user.status]}>
                        {user.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={user.status !== "offline"}
                        onCheckedChange={() => handleToggleStatus(user._id)}
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
                          <DropdownMenuItem onClick={() => openEditDialog(user)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeleteUser(user)}
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
          )}
        </CardContent>
      </Card>

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

      {/* Success Message */}
      {successMessage && (
        <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <Mail className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How User Invitations Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            When you add a user, they will receive an email invitation to join your organization.
            Once they accept and create their account, they will automatically appear in the list above
            and can start receiving calls.
          </p>
          <p className="mt-2">
            <strong>Note:</strong> Users must accept their invitation and log in for the calling features to work.
            Their browser will ring when calls come in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
