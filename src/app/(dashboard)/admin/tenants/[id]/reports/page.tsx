"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Loader2, BarChart3, Settings, Phone, MessageSquare, Users, Calendar, Download, Bot, Workflow, Columns3, ClipboardCheck
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SalesReportDashboard, MonthPicker } from "@/components/reports/sales-report-dashboard";
import { CallReportDashboard } from "@/components/reports/call-report-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cardPatterns } from "@/lib/style-constants";
import { cn } from "@/lib/utils";

export default function TenantReportsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const tenantId = params.id as string;
  const [now] = useState(() => new Date());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  const handlePrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear((y) => y - 1); }
    else { setSelectedMonth((m) => m - 1); }
  };
  const handleNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear((y) => y + 1); }
    else { setSelectedMonth((m) => m + 1); }
  };

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
        <Card className={cn(cardPatterns.pageCard, "max-w-md")}>
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don&apos;t have permission to view tenant dashboards.
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
        <Card className={cn(cardPatterns.pageCard, "max-w-md")}>
          <CardHeader className="text-center">
            <CardTitle>Tenant Not Found</CardTitle>
            <CardDescription>
              The tenant organization you&apos;re looking for doesn&apos;t exist.
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
    <div className="flex flex-col h-[calc(100vh-var(--header-height))]">
      {/* Navigation Menu */}
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
            <Link href={`/admin/tenants/${tenant._id}/tasks`}>
              <Button variant="ghost" size="sm" className="gap-2"><ClipboardCheck className="h-4 w-4" />Tasks</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}>
              <Button variant="secondary" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}>
              <Button variant="ghost" size="sm" className="gap-2"><Workflow className="h-4 w-4" />Workflows</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/pipelines`}>
              <Button variant="ghost" size="sm" className="gap-2"><Columns3 className="h-4 w-4" />Pipelines</Button>
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

      {/* Reports Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Reports</h1>
            <p className="text-sm text-on-surface-variant">{tenant.name}</p>
          </div>
          <MonthPicker
            month={selectedMonth}
            year={selectedYear}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            disableNext={isCurrentMonth}
          />
        </div>

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Sales Reports</TabsTrigger>
            <TabsTrigger value="calls">Call Reporting</TabsTrigger>
            <TabsTrigger value="downloads">Agency Downloads</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-4">
            <SalesReportDashboard
              organizationId={tenant._id}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </TabsContent>

          <TabsContent value="calls" className="mt-4">
            <CallReportDashboard
              organizationId={tenant._id}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </TabsContent>

          <TabsContent value="downloads" className="mt-4">
            <Card className={cn(cardPatterns.pageCard, "gap-0 py-0")}>
              <CardContent className="py-12 text-center">
                <Download className="h-10 w-10 text-on-surface-variant mx-auto mb-3" />
                <p className="text-sm font-medium">Agency Downloads</p>
                <p className="text-xs text-on-surface-variant mt-1">Export reports and documents. Coming soon.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
