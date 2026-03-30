"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign, TrendingUp, Users, AlertCircle,
  Loader2, RefreshCw, CheckCircle, Clock, XCircle,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AdminBillingPage() {
  const { user } = useUser();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  const isSuperAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const revenue = useQuery(api.usageInvoices.getRevenueSummary, {
    year: selectedYear,
    month: selectedMonth,
  });

  const invoices = useQuery(api.usageInvoices.getAllForMonth, {
    year: selectedYear,
    month: selectedMonth,
  });

  const handleGenerateInvoices = async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch("/api/stripe/usage-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGenResult(`Generated ${data.processed} invoices for ${MONTHS[selectedMonth]} ${selectedYear}`);
    } catch (err: any) {
      setGenResult(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <PageContainer>
        <div className="flex justify-center py-12 text-on-surface-variant">Access denied</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Billing & Revenue"
        description="Platform-wide revenue, usage invoices, and tenant billing overview."
        action={
          <div className="flex items-center gap-2">
            <Select value={`${selectedYear}-${selectedMonth}`} onValueChange={(v) => {
              const [y, m] = v.split("-");
              setSelectedYear(Number(y));
              setSelectedMonth(Number(m));
            }}>
              <SelectTrigger className="h-9 w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = (now.getMonth() - i + 12) % 12;
                  const y = now.getFullYear() - (now.getMonth() - i < 0 ? 1 : 0);
                  return (
                    <SelectItem key={`${y}-${m}`} value={`${y}-${m}`}>
                      {MONTHS[m]} {y}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleGenerateInvoices} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Generate Invoices
            </Button>
          </div>
        }
      />

      {genResult && (
        <div className="mb-4 text-sm font-medium flex items-center gap-2">
          {genResult.startsWith("Error") ? (
            <><AlertCircle className="h-4 w-4 text-destructive" /> <span className="text-destructive">{genResult}</span></>
          ) : (
            <><CheckCircle className="h-4 w-4 text-green-600" /> <span className="text-green-600">{genResult}</span></>
          )}
        </div>
      )}

      {/* Revenue Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-on-surface-variant font-medium">Subscription MRR</p>
              <DollarSign className="h-4 w-4 text-on-surface-variant" />
            </div>
            <p className="text-2xl font-bold mt-1">{revenue ? formatCents(revenue.totalMrrCents) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-on-surface-variant font-medium">Usage Revenue</p>
              <TrendingUp className="h-4 w-4 text-on-surface-variant" />
            </div>
            <p className="text-2xl font-bold mt-1">{revenue ? formatCents(revenue.totalUsageChargedCents) : "—"}</p>
            <p className="text-[10px] text-on-surface-variant">
              Cost: {revenue ? formatCents(revenue.totalUsageCostCents) : "—"} | Profit: {revenue ? formatCents(revenue.totalProfitCents) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-on-surface-variant font-medium">Total Revenue</p>
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600 mt-1">{revenue ? formatCents(revenue.totalRevenueCents) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-on-surface-variant font-medium">Tenants</p>
              <Users className="h-4 w-4 text-on-surface-variant" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="text-xs">{revenue?.activeTenantsCount ?? 0} Active</Badge>
              <Badge variant="secondary" className="text-xs">{revenue?.trialingTenantsCount ?? 0} Trial</Badge>
              {(revenue?.pastDueTenantsCount ?? 0) > 0 && (
                <Badge variant="destructive" className="text-xs">{revenue?.pastDueTenantsCount} Past Due</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">
            Usage Invoices — {MONTHS[selectedMonth]} {selectedYear}
            {invoices && <span className="text-on-surface-variant font-normal ml-2">({invoices.length} invoices)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {!invoices ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">
              No usage invoices for this month. Click "Generate Invoices" to create them.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs text-right">Twilio</TableHead>
                  <TableHead className="text-xs text-right">AI Voice</TableHead>
                  <TableHead className="text-xs text-right">AI SMS</TableHead>
                  <TableHead className="text-xs text-right">Total Cost</TableHead>
                  <TableHead className="text-xs text-right">Charged</TableHead>
                  <TableHead className="text-xs text-right">Profit</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv._id}>
                    <TableCell className="text-sm font-medium">{inv.orgName}</TableCell>
                    <TableCell className="text-xs text-right text-on-surface-variant">
                      {formatCents(inv.twilioCostCents)}
                      <br />
                      <span className="text-[10px]">{inv.twilioCallMinutes}m / {inv.twilioSmsSent} SMS</span>
                    </TableCell>
                    <TableCell className="text-xs text-right text-on-surface-variant">
                      {formatCents(inv.retellCostCents)}
                      <br />
                      <span className="text-[10px]">{inv.retellCallCount} calls</span>
                    </TableCell>
                    <TableCell className="text-xs text-right text-on-surface-variant">
                      {formatCents(inv.openaiCostCents)}
                      <br />
                      <span className="text-[10px]">{inv.openaiConversations} convos</span>
                    </TableCell>
                    <TableCell className="text-xs text-right">{formatCents(inv.totalCostCents)}</TableCell>
                    <TableCell className="text-sm text-right font-semibold">{formatCents(inv.totalChargedCents)}</TableCell>
                    <TableCell className="text-xs text-right text-green-600 font-medium">{formatCents(inv.profitCents)}</TableCell>
                    <TableCell className="text-center">
                      {inv.status === "paid" && <Badge variant="default" className="text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>}
                      {inv.status === "sent" && <Badge variant="secondary" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Sent</Badge>}
                      {inv.status === "draft" && <Badge variant="outline" className="text-[10px]">Draft</Badge>}
                      {inv.status === "failed" && <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
