"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCompact(amount: number): string {
  if (amount >= 1000000) return "$" + (amount / 1000000).toFixed(1) + "M";
  if (amount >= 1000) return "$" + (amount / 1000).toFixed(1) + "K";
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Small inline donut for goal progress */
function GoalDonut({ current, goal, isCurrency }: {
  current: number;
  goal: number;
  isCurrency?: boolean;
}) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const isComplete = current >= goal;
  const size = 56;
  const center = size / 2;
  const trackWidth = 5;
  const radius = (size - trackWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center} cy={center} r={radius}
          fill="none" strokeWidth={trackWidth}
          className="stroke-purple-200 dark:stroke-purple-800"
        />
        {pct > 0 && (
          <circle
            cx={center} cy={center} r={radius}
            fill="none" strokeWidth={trackWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={isComplete ? "stroke-green-500" : "stroke-purple-500"}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        )}
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${isComplete ? "text-green-600" : "text-purple-600 dark:text-purple-400"}`}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

type ReportData = {
  summary: { totalSales: number; totalPremium: number; avgPremium: number; totalPolicies: number };
  byCarrier: { carrierId: string; carrierName: string; salesCount: number; policyCount: number; totalPremium: number }[];
  byProduct: { productId: string; productName: string; salesCount: number; totalPremium: number }[];
  byUser: { userId: string; userName: string; salesCount: number; policyCount: number; totalPremium: number }[];
};

/** Inline detail table loaded lazily when expanded */
function SalesDetailTable({
  organizationId,
  startDate,
  endDate,
}: {
  organizationId: Id<"organizations">;
  startDate: number;
  endDate: number;
}) {
  const salesList = useQuery(api.salesReports.getSalesList, {
    organizationId,
    startDate,
    endDate,
  });

  if (salesList === undefined) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (salesList.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-6 text-sm">
        No sales found for this period.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Carrier</TableHead>
          <TableHead>Policy #</TableHead>
          <TableHead className="text-right">Premium</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {salesList.map((sale) => (
          <TableRow key={sale._id}>
            <TableCell className="whitespace-nowrap">
              {new Date(sale.effectiveDate).toLocaleDateString()}
            </TableCell>
            <TableCell className="font-medium">{sale.contactName}</TableCell>
            <TableCell>{sale.userName}</TableCell>
            <TableCell>{sale.carrierName}</TableCell>
            <TableCell className="text-muted-foreground">{sale.policyNumber || "—"}</TableCell>
            <TableCell className="text-right">{formatCurrency(sale.totalPremium)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="font-semibold border-t-2">
          <TableCell colSpan={5}>Total ({salesList.length} sales)</TableCell>
          <TableCell className="text-right">
            {formatCurrency(salesList.reduce((s, r) => s + r.totalPremium, 0))}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

/** Single slim expandable summary row */
function SummaryRow({
  label,
  report,
  premiumGoal,
  policyGoal,
  isExpanded,
  onToggle,
  organizationId,
  startDate,
  endDate,
}: {
  label: string;
  report: ReportData | undefined;
  premiumGoal?: number;
  policyGoal?: number;
  isExpanded: boolean;
  onToggle: () => void;
  organizationId: Id<"organizations">;
  startDate: number;
  endDate: number;
}) {
  const [isHovered, setIsHovered] = useState(false);

  if (report === undefined) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="py-3 px-4">
        {/* Summary row: label | policies | premium | avg | goals */}
        <div className="flex items-center gap-4">
          {/* Label */}
          <div className="font-semibold text-sm min-w-[70px] shrink-0">{label}</div>

          {/* Stats inline */}
          <div className="flex items-center gap-6 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Policies</span>
              <span className="text-sm font-bold">{report.summary.totalPolicies}</span>
              {policyGoal != null && policyGoal > 0 && (
                <GoalDonut current={report.summary.totalPolicies} goal={policyGoal} />
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Premium</span>
              <span className="text-sm font-bold">{formatCompact(report.summary.totalPremium)}</span>
              {premiumGoal != null && premiumGoal > 0 && (
                <GoalDonut current={report.summary.totalPremium} goal={premiumGoal} isCurrency />
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Avg</span>
              <span className="text-sm font-bold">{formatCompact(report.summary.avgPremium)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sales</span>
              <span className="text-sm font-bold">{report.summary.totalSales}</span>
            </div>
          </div>

          {/* Expand arrow — visible on hover or when expanded */}
          <div
            className={cn(
              "transition-opacity duration-200",
              isHovered || isExpanded ? "opacity-100" : "opacity-0"
            )}
          >
            <button
              onClick={onToggle}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )}
              />
            </button>
          </div>
        </div>

        {/* Expanded detail table */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-in-out",
            isExpanded ? "max-h-[2000px] opacity-100 mt-3" : "max-h-0 opacity-0"
          )}
        >
          <div className="border-t border-border/40 pt-3">
            <SalesDetailTable
              organizationId={organizationId}
              startDate={startDate}
              endDate={endDate}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Slim expandable row for commission breakdowns */
function CommissionSummaryRow({
  label,
  stats,
  isExpanded,
  onToggle,
  table,
}: {
  label: string;
  stats: { label: string; value: string; color?: string }[];
  isExpanded: boolean;
  onToggle: () => void;
  table: React.ReactNode;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-4">
          <div className="font-semibold text-sm min-w-[80px] shrink-0">{label}</div>

          <div className="flex items-center gap-6 flex-1 min-w-0">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className={cn("text-sm font-bold", s.color)}>{s.value}</span>
              </div>
            ))}
          </div>

          <div
            className={cn(
              "transition-opacity duration-200",
              isHovered || isExpanded ? "opacity-100" : "opacity-0"
            )}
          >
            <button
              onClick={onToggle}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )}
              />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-in-out",
            isExpanded ? "max-h-[2000px] opacity-100 mt-3" : "max-h-0 opacity-0"
          )}
        >
          <div className="border-t border-border/40 pt-3">
            {table}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Month picker exported for external placement */
export function MonthPicker({ month, year, onPrev, onNext, disableNext }: {
  month: number;
  year: number;
  onPrev: () => void;
  onNext: () => void;
  disableNext: boolean;
}) {
  return (
    <div className="flex items-center gap-1 border rounded-md px-1">
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium min-w-35 text-center">
        {MONTH_NAMES[month]} {year}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onNext}
        disabled={disableNext}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface SalesReportDashboardProps {
  organizationId: Id<"organizations">;
  selectedMonth: number;
  selectedYear: number;
}

export function SalesReportDashboard({ organizationId, selectedMonth, selectedYear }: SalesReportDashboardProps) {
  const [nowStable] = useState(() => new Date());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const isCurrentMonth = selectedYear === nowStable.getFullYear() && selectedMonth === nowStable.getMonth();

  const { dailyRange, weeklyRange, monthlyRange, ytdRange } = useMemo(() => {
    const endTs = nowStable.getTime();
    const today = new Date(nowStable.getFullYear(), nowStable.getMonth(), nowStable.getDate());
    const todayTs = today.getTime();

    const daily = { start: todayTs, end: endTs };

    const day = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((day + 6) % 7));
    const weekly = { start: mon.getTime(), end: endTs };

    const mStart = new Date(selectedYear, selectedMonth, 1).getTime();
    const mEnd = isCurrentMonth
      ? endTs
      : new Date(selectedYear, selectedMonth + 1, 1).getTime() - 1;
    const monthly = { start: mStart, end: mEnd };

    const yStart = new Date(selectedYear, 0, 1).getTime();
    const yEnd = selectedYear === nowStable.getFullYear()
      ? endTs
      : new Date(selectedYear + 1, 0, 1).getTime() - 1;
    const ytd = { start: yStart, end: yEnd };

    return { dailyRange: daily, weeklyRange: weekly, monthlyRange: monthly, ytdRange: ytd };
  }, [nowStable, selectedMonth, selectedYear, isCurrentMonth]);

  // Only fetch daily/weekly for current month (they use today's date, not the selected month)
  const dailyReport = useQuery(
    api.salesReports.getSalesReport,
    isCurrentMonth ? { organizationId, startDate: dailyRange.start, endDate: dailyRange.end } : "skip"
  );
  const weeklyReport = useQuery(
    api.salesReports.getSalesReport,
    isCurrentMonth ? { organizationId, startDate: weeklyRange.start, endDate: weeklyRange.end } : "skip"
  );
  const monthlyReport = useQuery(api.salesReports.getSalesReport, {
    organizationId,
    startDate: monthlyRange.start,
    endDate: monthlyRange.end,
  });
  const ytdReport = useQuery(api.salesReports.getSalesReport, {
    organizationId,
    startDate: ytdRange.start,
    endDate: ytdRange.end,
  });

  // Always fetch current month's goals for donut targets, even when viewing prior months
  const currentMonthGoal = useQuery(api.salesGoals.getForMonth, {
    organizationId,
    month: nowStable.getMonth(),
    year: nowStable.getFullYear(),
  });
  // Also fetch selected month's goals (may be same query if current month)
  const selectedMonthGoal = useQuery(api.salesGoals.getForMonth, {
    organizationId,
    month: selectedMonth,
    year: selectedYear,
  });
  // Use selected month goals if they exist, otherwise fall back to current month goals
  const monthGoal = selectedMonthGoal ?? currentMonthGoal;

  const commissionReport = useQuery(api.salesReports.getCommissionReport, {
    organizationId,
    startDate: monthlyRange.start,
    endDate: monthlyRange.end,
  });

  const tableReport = monthlyReport;

  const toggleRow = (key: string) => {
    setExpandedRow((prev) => (prev === key ? null : key));
  };

  return (
    <div className="space-y-6">
      {/* Summary Rows */}
      <div className="space-y-2">
        {isCurrentMonth && (
          <>
            <SummaryRow
              label="Daily"
              report={dailyReport}
              premiumGoal={monthGoal?.dailyPremium}
              policyGoal={monthGoal?.dailyPolicies}
              isExpanded={expandedRow === "daily"}
              onToggle={() => toggleRow("daily")}
              organizationId={organizationId}
              startDate={dailyRange.start}
              endDate={dailyRange.end}
            />
            <SummaryRow
              label="Weekly"
              report={weeklyReport}
              premiumGoal={monthGoal?.weeklyPremium}
              policyGoal={monthGoal?.weeklyPolicies}
              isExpanded={expandedRow === "weekly"}
              onToggle={() => toggleRow("weekly")}
              organizationId={organizationId}
              startDate={weeklyRange.start}
              endDate={weeklyRange.end}
            />
          </>
        )}
        <SummaryRow
          label="Monthly"
          report={monthlyReport}
          premiumGoal={monthGoal?.monthlyPremium}
          policyGoal={monthGoal?.monthlyPolicies}
          isExpanded={expandedRow === "monthly"}
          onToggle={() => toggleRow("monthly")}
          organizationId={organizationId}
          startDate={monthlyRange.start}
          endDate={monthlyRange.end}
        />
        <SummaryRow
          label="YTD"
          report={ytdReport}
          isExpanded={expandedRow === "ytd"}
          onToggle={() => toggleRow("ytd")}
          organizationId={organizationId}
          startDate={ytdRange.start}
          endDate={ytdRange.end}
        />
      </div>

      {/* Detailed Tables (Monthly data) */}
      {tableReport === undefined ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="carrier">
          <TabsList>
            <TabsTrigger value="carrier">By Carrier</TabsTrigger>
            <TabsTrigger value="lob">By Line of Business</TabsTrigger>
            <TabsTrigger value="user">By User</TabsTrigger>
            <TabsTrigger value="commissions">Estimated Commissions</TabsTrigger>
          </TabsList>

          <TabsContent value="carrier">
            <Card>
              <CardContent className="pt-6">
                {tableReport.byCarrier.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No sales found for this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Carrier</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Policies</TableHead>
                        <TableHead className="text-right">Premium</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableReport.byCarrier.map((row) => (
                        <TableRow key={row.carrierId}>
                          <TableCell className="font-medium">{row.carrierName}</TableCell>
                          <TableCell className="text-right">{row.salesCount}</TableCell>
                          <TableCell className="text-right">{row.policyCount}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.totalPremium)}</TableCell>
                          <TableCell className="text-right">
                            {tableReport.summary.totalPremium > 0
                              ? ((row.totalPremium / tableReport.summary.totalPremium) * 100).toFixed(1)
                              : "0.0"}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lob">
            <Card>
              <CardContent className="pt-6">
                {tableReport.byProduct.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No sales found for this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line of Business</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Premium</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableReport.byProduct.map((row) => {
                        const lobTotal = tableReport.byProduct.reduce((s, r) => s + r.totalPremium, 0);
                        return (
                          <TableRow key={row.productId}>
                            <TableCell className="font-medium">{row.productName}</TableCell>
                            <TableCell className="text-right">{row.salesCount}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.totalPremium)}</TableCell>
                            <TableCell className="text-right">
                              {lobTotal > 0
                                ? ((row.totalPremium / lobTotal) * 100).toFixed(1)
                                : "0.0"}%
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="user">
            <Card>
              <CardContent className="pt-6">
                {tableReport.byUser.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No sales found for this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Policies</TableHead>
                        <TableHead className="text-right">Premium</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableReport.byUser.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell className="font-medium">{row.userName}</TableCell>
                          <TableCell className="text-right">{row.salesCount}</TableCell>
                          <TableCell className="text-right">{row.policyCount}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.totalPremium)}</TableCell>
                          <TableCell className="text-right">
                            {tableReport.summary.totalPremium > 0
                              ? ((row.totalPremium / tableReport.summary.totalPremium) * 100).toFixed(1)
                              : "0.0"}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commissions">
            {commissionReport === undefined ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                <CommissionSummaryRow
                  label="Summary"
                  stats={[
                    { label: "Premium", value: formatCompact(commissionReport.totalPremium) },
                    { label: "New Biz Commission", value: formatCompact(commissionReport.totalEstimatedCommission), color: "text-green-600" },
                    { label: "Renewal Commission", value: formatCompact(commissionReport.totalEstimatedRenewal), color: "text-blue-600" },
                  ]}
                  isExpanded={expandedRow === "comm-summary"}
                  onToggle={() => toggleRow("comm-summary")}
                  table={
                    <div className="grid grid-cols-3 gap-6 py-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Premium</p>
                        <p className="text-lg font-bold">{formatCurrency(commissionReport.totalPremium)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Est. New Business Commission</p>
                        <p className="text-lg font-bold text-green-600">{formatCurrency(commissionReport.totalEstimatedCommission)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Est. Renewal Commission</p>
                        <p className="text-lg font-bold text-blue-600">{formatCurrency(commissionReport.totalEstimatedRenewal)}</p>
                      </div>
                    </div>
                  }
                />

                <CommissionSummaryRow
                  label="By Carrier"
                  stats={[
                    { label: "Carriers", value: String(commissionReport.byCarrier.length) },
                    { label: "Premium", value: formatCompact(commissionReport.totalPremium) },
                    { label: "Commission", value: formatCompact(commissionReport.totalEstimatedCommission), color: "text-green-600" },
                  ]}
                  isExpanded={expandedRow === "comm-carrier"}
                  onToggle={() => toggleRow("comm-carrier")}
                  table={
                    commissionReport.byCarrier.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6 text-sm">No commission data for this period.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Carrier</TableHead>
                            <TableHead className="text-right">Policies</TableHead>
                            <TableHead className="text-right">Premium</TableHead>
                            <TableHead className="text-right">Est. Commission</TableHead>
                            <TableHead className="text-right">Est. Renewal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {commissionReport.byCarrier.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.name}</TableCell>
                              <TableCell className="text-right">{row.policies}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.premium)}</TableCell>
                              <TableCell className="text-right text-green-600">{formatCurrency(row.commission)}</TableCell>
                              <TableCell className="text-right text-blue-600">{formatCurrency(row.renewal)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-semibold border-t-2">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right">{commissionReport.byCarrier.reduce((s, r) => s + r.policies, 0)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(commissionReport.totalPremium)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatCurrency(commissionReport.totalEstimatedCommission)}</TableCell>
                            <TableCell className="text-right text-blue-600">{formatCurrency(commissionReport.totalEstimatedRenewal)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )
                  }
                />

                <CommissionSummaryRow
                  label="By LOB"
                  stats={[
                    { label: "Lines", value: String(commissionReport.byProduct.length) },
                    { label: "Premium", value: formatCompact(commissionReport.byProduct.reduce((s, r) => s + r.premium, 0)) },
                    { label: "Commission", value: formatCompact(commissionReport.byProduct.reduce((s, r) => s + r.commission, 0)), color: "text-green-600" },
                  ]}
                  isExpanded={expandedRow === "comm-lob"}
                  onToggle={() => toggleRow("comm-lob")}
                  table={
                    commissionReport.byProduct.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6 text-sm">No commission data for this period.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Line of Business</TableHead>
                            <TableHead className="text-right">Policies</TableHead>
                            <TableHead className="text-right">Premium</TableHead>
                            <TableHead className="text-right">Est. Commission</TableHead>
                            <TableHead className="text-right">Est. Renewal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {commissionReport.byProduct.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.name}</TableCell>
                              <TableCell className="text-right">{row.policies}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.premium)}</TableCell>
                              <TableCell className="text-right text-green-600">{formatCurrency(row.commission)}</TableCell>
                              <TableCell className="text-right text-blue-600">{formatCurrency(row.renewal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )
                  }
                />

                <CommissionSummaryRow
                  label="By Agent"
                  stats={[
                    { label: "Agents", value: String(commissionReport.byUser.length) },
                    { label: "Agent Comm", value: formatCompact(commissionReport.byUser.reduce((s, r) => s + r.agentCommission, 0)), color: "text-purple-600" },
                    { label: "Agent Renewal", value: formatCompact(commissionReport.byUser.reduce((s, r) => s + r.agentRenewal, 0)), color: "text-blue-600" },
                  ]}
                  isExpanded={expandedRow === "comm-agent"}
                  onToggle={() => toggleRow("comm-agent")}
                  table={
                    commissionReport.byUser.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6 text-sm">No commission data for this period.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Agent</TableHead>
                            <TableHead className="text-right">Comm Split</TableHead>
                            <TableHead className="text-right">Renewal Split</TableHead>
                            <TableHead className="text-right">Policies</TableHead>
                            <TableHead className="text-right">Premium</TableHead>
                            <TableHead className="text-right">Agency Commission</TableHead>
                            <TableHead className="text-right">Agent Commission</TableHead>
                            <TableHead className="text-right">Agent Renewal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {commissionReport.byUser.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.name}</TableCell>
                              <TableCell className="text-right">{row.splitPct > 0 ? `${row.splitPct}%` : "—"}</TableCell>
                              <TableCell className="text-right">{row.renewalSplitPct > 0 ? `${row.renewalSplitPct}%` : "—"}</TableCell>
                              <TableCell className="text-right">{row.policies}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.premium)}</TableCell>
                              <TableCell className="text-right text-green-600">{formatCurrency(row.commission)}</TableCell>
                              <TableCell className="text-right text-purple-600 font-medium">{formatCurrency(row.agentCommission)}</TableCell>
                              <TableCell className="text-right text-blue-600">{formatCurrency(row.agentRenewal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )
                  }
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
