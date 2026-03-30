"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Loader2, Download } from "lucide-react";
import { MonthPicker } from "@/components/reports/sales-report-dashboard";
import dynamic from "next/dynamic";

const SalesReportDashboard = dynamic(
  () => import("@/components/reports/sales-report-dashboard").then(m => ({ default: m.SalesReportDashboard })),
  { ssr: false, loading: () => <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" /></div> }
);
const CallReportDashboard = dynamic(
  () => import("@/components/reports/call-report-dashboard").then(m => ({ default: m.CallReportDashboard })),
  { ssr: false, loading: () => <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" /></div> }
);
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { cardPatterns } from "@/lib/style-constants";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const [now] = useState(() => new Date());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading reports...</span>
        </div>
      </div>
    );
  }

  if (!convexOrg) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-on-surface-variant">Organization not found.</p>
      </div>
    );
  }

  return (
    <PageContainer variant="scroll">
      <PageHeader
        title="Reports"
        description={convexOrg.name}
        action={
          <MonthPicker
            month={selectedMonth}
            year={selectedYear}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            disableNext={isCurrentMonth}
          />
        }
      />

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales Reports</TabsTrigger>
          <TabsTrigger value="calls">Call Reporting</TabsTrigger>
          <TabsTrigger value="downloads">Agency Downloads</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <SalesReportDashboard
            organizationId={convexOrg._id}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <CallReportDashboard
            organizationId={convexOrg._id}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </TabsContent>

        <TabsContent value="downloads" className="mt-4">
          <Card className={cn(cardPatterns.pageCard, "gap-0 py-0")}>
            <CardContent className="py-12 text-center">
              <Download className="h-10 w-10 text-on-surface-variant mx-auto mb-3" />
              <p className="text-sm font-bold">Agency Downloads</p>
              <p className="text-xs text-on-surface-variant mt-1">Export reports and documents. Coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
