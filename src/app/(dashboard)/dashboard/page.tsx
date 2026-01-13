"use client";

import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../../convex/_generated/api";
import { CallingDashboard } from "@/components/calling/calling-dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Users, Clock, PhoneIncoming, Shield, Settings, Loader2, Eye, ArrowLeft, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { useState } from "react";

export default function DashboardPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const [showSetupBanner, setShowSetupBanner] = useState(true);

  // Check if platform is configured
  const platformOrg = useQuery(api.organizations.getPlatformOrg);

  // Check if current user is a platform user
  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Check if current user is super_admin
  const isSuperAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Check onboarding status to show warning banner
  const onboardingStatus = useQuery(
    api.organizations.getOnboardingStatus,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Check if the CURRENTLY SELECTED org is the platform org
  const isCurrentOrgPlatformOrg = platformOrg && organization && platformOrg.clerkOrgId === organization.id;

  // Redirect platform users to admin dashboard when they sign in
  // Platform users should use the TenantSwitcher to view tenant dashboards, not direct navigation
  useEffect(() => {
    if (isPlatformUser === true) {
      router.push("/admin");
    }
  }, [isPlatformUser, router]);

  // Show loading while checking platform user status
  if (isPlatformUser === undefined || platformOrg === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If platform user, show redirecting message (they should use /admin)
  if (isPlatformUser === true) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting to Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  // Show organization selection prompt if no org selected
  if (orgLoaded && !organization) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Welcome to VoIP CRM</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            <p>Please select or create an organization to get started.</p>
            <p className="mt-2 text-sm">
              Use the organization switcher in the header to create or join an
              organization.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!orgLoaded || !userLoaded) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  // Show setup prompt if platform is not configured
  if (platformOrg === null) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Platform Setup Required</CardTitle>
            <CardDescription>
              The SaaS platform has not been configured yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Complete the initial setup to configure yourself as the Super Admin
              and set up your platform organization.
            </p>
            <Link href="/setup">
              <Button className="w-full">
                <Shield className="h-4 w-4 mr-2" />
                Go to Setup
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if platform user is viewing a tenant org (not the platform org)
  const isPlatformUserViewingTenant = isPlatformUser === true && !isCurrentOrgPlatformOrg;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Admin banner for platform users viewing tenant orgs */}
      {isPlatformUserViewingTenant && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
          <Eye className="h-4 w-4 text-blue-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-blue-800 dark:text-blue-200">
              <strong>Platform Admin View:</strong> Viewing {organization?.name}&apos;s dashboard
            </span>
            <Link href="/admin">
              <Button variant="outline" size="sm" className="border-blue-300 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900/50">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Warning banner for skipped onboarding / unconfigured Twilio */}
      {showSetupBanner &&
        onboardingStatus?.reason === "skipped" &&
        !onboardingStatus?.twilioConfigured && (
          <Alert className="rounded-none border-x-0 border-t-0 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-amber-800 dark:text-amber-200">
                <strong>Setup Incomplete:</strong> Phone calls won&apos;t work until you configure Twilio credentials.
              </span>
              <div className="flex items-center gap-2">
                <Link href="/settings/twilio">
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                    <Settings className="h-4 w-4 mr-2" />
                    Configure Twilio
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSetupBanner(false)}
                  className="text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
                >
                  Dismiss
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

      {/* Stats bar */}
      <div className="border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-green-500" />
            <span className="text-sm">
              <span className="font-medium">0</span> Active Calls
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PhoneIncoming className="h-4 w-4 text-yellow-500" />
            <span className="text-sm">
              <span className="font-medium">0</span> Waiting
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm">
              <span className="font-medium">0</span> Agents Online
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Avg Wait: 0:00
            </span>
          </div>
        </div>
      </div>

      {/* Main calling dashboard */}
      <CallingDashboard organizationId={organization?.id} />
    </div>
  );
}
