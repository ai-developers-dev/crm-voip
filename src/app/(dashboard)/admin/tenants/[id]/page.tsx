"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Building2, Users, Phone, Clock, Eye, Loader2, Settings } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CallingDashboard } from "@/components/calling/calling-dashboard";

export default function TenantViewPage() {
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

  // Get tenant users
  const tenantUsers = useQuery(
    api.users.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

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
              You don't have permission to view tenant dashboards.
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Impersonation Banner */}
      <Alert className="rounded-none border-x-0 border-t-0 bg-amber-500/10 border-amber-500/20">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-400">
            <strong>Viewing as:</strong> {tenant.name} ({tenant.plan} plan)
          </span>
          <Link href="/admin">
            <Button variant="outline" size="sm" className="border-amber-500/30 hover:bg-amber-500/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </AlertDescription>
      </Alert>

      {/* Tenant Stats Bar */}
      <div className="border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="font-medium">{tenant.name}</span>
              <Badge variant="secondary">{tenant.plan}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm">
                <span className="font-medium">{tenantUsers?.length ?? 0}</span> Users
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-green-500" />
              <span className="text-sm">
                <span className="font-medium">0</span> Active Calls
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Max Concurrent: {tenant.settings.maxConcurrentCalls}
              </span>
            </div>
          </div>
          <Link href={`/admin/tenants/${tenant._id}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Tenant's Calling Dashboard */}
      <CallingDashboard
        organizationId={tenant.clerkOrgId}
        viewMode="admin"
      />
    </div>
  );
}
