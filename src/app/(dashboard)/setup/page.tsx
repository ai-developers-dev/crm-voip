"use client";

import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if platform org exists
  const platformOrg = useQuery(api.organizations.getPlatformOrg);

  // Check if current user is already a platform user
  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Check if current user is super_admin
  const isSuperAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Get current organization from Convex
  const currentOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Bootstrap mutation
  const bootstrapSuperAdmin = useMutation(api.platformUsers.bootstrapSuperAdmin);
  const setPlatformOrg = useMutation(api.organizations.setPlatformOrg);

  const isLoading = !orgLoaded || !userLoaded || platformOrg === undefined || isPlatformUser === undefined;

  const handleBootstrap = async () => {
    if (!user || !currentOrg) return;

    setIsBootstrapping(true);
    setError(null);

    try {
      // First, bootstrap the current user as super_admin
      await bootstrapSuperAdmin({
        clerkUserId: user.id,
        email: user.primaryEmailAddress?.emailAddress || "",
        name: user.fullName || "Super Admin",
        avatarUrl: user.imageUrl,
      });

      // Then, set the current organization as the platform org
      await setPlatformOrg({
        organizationId: currentOrg._id,
      });

      // Redirect to dashboard after successful setup
      router.push("/dashboard");
    } catch (err) {
      console.error("Bootstrap error:", err);
      setError(err instanceof Error ? err.message : "Failed to complete setup");
    } finally {
      setIsBootstrapping(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading setup...
        </div>
      </div>
    );
  }

  // If platform is already configured, show status
  if (platformOrg) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Platform Already Configured</CardTitle>
            <CardDescription>
              The SaaS platform has already been set up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Platform Organization</span>
              </div>
              <p className="text-sm text-muted-foreground">{platformOrg.name}</p>
            </div>

            {isSuperAdmin && (
              <Badge variant="default" className="w-full justify-center py-2">
                <Shield className="h-4 w-4 mr-2" />
                You are a Super Admin
              </Badge>
            )}

            {isPlatformUser && !isSuperAdmin && (
              <Badge variant="secondary" className="w-full justify-center py-2">
                <Shield className="h-4 w-4 mr-2" />
                You are Platform Staff
              </Badge>
            )}

            {!isPlatformUser && (
              <Badge variant="outline" className="w-full justify-center py-2">
                You are a Tenant User
              </Badge>
            )}

            <Button
              onClick={() => router.push("/dashboard")}
              className="w-full"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no organization selected
  if (!organization || !currentOrg) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <CardTitle>Organization Required</CardTitle>
            <CardDescription>
              Please create or select an organization first to set up the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p>
              Use the organization switcher in the header to create your platform organization.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show bootstrap UI
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Platform Setup</CardTitle>
          <CardDescription>
            Set up your SaaS VoIP CRM platform. This is a one-time configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current user info */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <h4 className="font-medium text-sm">You will be configured as:</h4>
            <div className="flex items-center gap-3">
              {user?.imageUrl && (
                <img
                  src={user.imageUrl}
                  alt={user.fullName || ""}
                  className="h-10 w-10 rounded-full"
                />
              )}
              <div>
                <p className="font-medium">{user?.fullName || "User"}</p>
                <p className="text-sm text-muted-foreground">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
              </div>
              <Badge className="ml-auto">Super Admin</Badge>
            </div>
          </div>

          {/* Organization info */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <h4 className="font-medium text-sm">Platform Organization:</h4>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-medium">
                {organization.name?.charAt(0).toUpperCase() || "O"}
              </div>
              <div>
                <p className="font-medium">{organization.name}</p>
                <p className="text-sm text-muted-foreground">
                  This will be your SaaS platform organization
                </p>
              </div>
            </div>
          </div>

          {/* Role hierarchy explanation */}
          <div className="rounded-lg border p-4 space-y-2">
            <h4 className="font-medium text-sm">Role Hierarchy</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Platform Level (SaaS Owner):</strong></p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Super Admin - Full platform access</li>
                <li>Platform Staff - Support and operations</li>
              </ul>
              <p className="mt-2"><strong>Tenant Level (Customers):</strong></p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Tenant Admin - Organization management</li>
                <li>Supervisor - Team management</li>
                <li>Agent - Call handling</li>
              </ul>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={handleBootstrap}
            className="w-full"
            disabled={isBootstrapping}
          >
            {isBootstrapping ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Setting up platform...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Complete Platform Setup
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            This action cannot be undone. You will become the Super Admin of this platform.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
