"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Loader2, ChevronDown, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDurationCompact(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

type CallReportData = {
  summary: {
    totalCalls: number;
    inboundAnswered: number;
    inboundMissed: number;
    outbound: number;
    totalTalkTime: number;
    avgTalkTime: number;
  };
  byUser: {
    userId: string;
    userName: string;
    inboundAnswered: number;
    inboundMissed: number;
    outbound: number;
    totalCalls: number;
    totalTalkTime: number;
    avgTalkTime: number;
  }[];
  byOutcome: { outcome: string; count: number; percentage: number }[];
  byHour: { hour: number; inbound: number; outbound: number }[];
};

/** Slim expandable call summary row — matches SalesReportDashboard SummaryRow */
function CallSummaryRow({
  label,
  report,
  isExpanded,
  onToggle,
}: {
  label: string;
  report: CallReportData | undefined;
  isExpanded: boolean;
  onToggle: () => void;
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

  const answerRate = report.summary.inboundAnswered + report.summary.inboundMissed > 0
    ? ((report.summary.inboundAnswered / (report.summary.inboundAnswered + report.summary.inboundMissed)) * 100).toFixed(0)
    : "—";

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-4">
          <div className="font-semibold text-sm min-w-[70px] shrink-0">{label}</div>

          <div className="flex items-center gap-6 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-sm font-bold">{report.summary.totalCalls}</span>
            </div>

            <div className="flex items-center gap-2">
              <PhoneIncoming className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs text-muted-foreground">In</span>
              <span className="text-sm font-bold text-green-600">{report.summary.inboundAnswered}</span>
            </div>

            <div className="flex items-center gap-2">
              <PhoneMissed className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-muted-foreground">Missed</span>
              <span className="text-sm font-bold text-red-500">{report.summary.inboundMissed}</span>
            </div>

            <div className="flex items-center gap-2">
              <PhoneOutgoing className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs text-muted-foreground">Out</span>
              <span className="text-sm font-bold text-blue-600">{report.summary.outbound}</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg</span>
              <span className="text-sm font-bold">{formatDurationCompact(report.summary.avgTalkTime)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Answer</span>
              <span className={cn("text-sm font-bold", typeof answerRate === "string" && answerRate !== "—" && parseInt(answerRate) >= 80 ? "text-green-600" : parseInt(answerRate as string) < 60 ? "text-red-500" : "")}>
                {answerRate}{answerRate !== "—" ? "%" : ""}
              </span>
            </div>
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

        {/* Expanded: per-user table */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-in-out",
            isExpanded ? "max-h-[2000px] opacity-100 mt-3" : "max-h-0 opacity-0"
          )}
        >
          <div className="border-t border-border/40 pt-3">
            {report.byUser.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">No calls for this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Inbound</TableHead>
                    <TableHead className="text-right">Missed</TableHead>
                    <TableHead className="text-right">Outbound</TableHead>
                    <TableHead className="text-right">Talk Time</TableHead>
                    <TableHead className="text-right">Avg Talk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byUser.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="font-medium">{row.userName}</TableCell>
                      <TableCell className="text-right">{row.totalCalls}</TableCell>
                      <TableCell className="text-right text-green-600">{row.inboundAnswered}</TableCell>
                      <TableCell className="text-right text-red-500">{row.inboundMissed}</TableCell>
                      <TableCell className="text-right text-blue-600">{row.outbound}</TableCell>
                      <TableCell className="text-right">{formatDuration(row.totalTalkTime)}</TableCell>
                      <TableCell className="text-right">{formatDuration(row.avgTalkTime)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>Total ({report.byUser.length} agents)</TableCell>
                    <TableCell className="text-right">{report.summary.totalCalls}</TableCell>
                    <TableCell className="text-right text-green-600">{report.summary.inboundAnswered}</TableCell>
                    <TableCell className="text-right text-red-500">{report.summary.inboundMissed}</TableCell>
                    <TableCell className="text-right text-blue-600">{report.summary.outbound}</TableCell>
                    <TableCell className="text-right">{formatDuration(report.summary.totalTalkTime)}</TableCell>
                    <TableCell className="text-right">{formatDuration(report.summary.avgTalkTime)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface CallReportDashboardProps {
  organizationId: Id<"organizations">;
  selectedMonth: number;
  selectedYear: number;
}

export function CallReportDashboard({ organizationId, selectedMonth, selectedYear }: CallReportDashboardProps) {
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

  const dailyReport = useQuery(
    api.callStats.getCallReport,
    isCurrentMonth ? { organizationId, startDate: dailyRange.start, endDate: dailyRange.end } : "skip"
  );
  const weeklyReport = useQuery(
    api.callStats.getCallReport,
    isCurrentMonth ? { organizationId, startDate: weeklyRange.start, endDate: weeklyRange.end } : "skip"
  );
  const monthlyReport = useQuery(api.callStats.getCallReport, {
    organizationId,
    startDate: monthlyRange.start,
    endDate: monthlyRange.end,
  });
  const ytdReport = useQuery(api.callStats.getCallReport, {
    organizationId,
    startDate: ytdRange.start,
    endDate: ytdRange.end,
  });

  const toggleRow = (key: string) => {
    setExpandedRow((prev) => (prev === key ? null : key));
  };

  const hourlyData = monthlyReport?.byHour;

  return (
    <div className="space-y-6">
      {/* Summary Rows */}
      <div className="space-y-2">
        {isCurrentMonth && (
          <>
            <CallSummaryRow
              label="Daily"
              report={dailyReport}
              isExpanded={expandedRow === "daily"}
              onToggle={() => toggleRow("daily")}
            />
            <CallSummaryRow
              label="Weekly"
              report={weeklyReport}
              isExpanded={expandedRow === "weekly"}
              onToggle={() => toggleRow("weekly")}
            />
          </>
        )}
        <CallSummaryRow
          label="Monthly"
          report={monthlyReport}
          isExpanded={expandedRow === "monthly"}
          onToggle={() => toggleRow("monthly")}
        />
        <CallSummaryRow
          label="YTD"
          report={ytdReport}
          isExpanded={expandedRow === "ytd"}
          onToggle={() => toggleRow("ytd")}
        />
      </div>

      {/* Hourly Call Volume */}
      {hourlyData && (
        <Card>
          <CardContent className="pt-5 pb-4 px-4">
            <p className="text-sm font-semibold mb-3">Call Volume by Hour (Monthly)</p>
            <div className="flex items-end gap-[3px] h-28">
              {hourlyData.map((h) => {
                const total = h.inbound + h.outbound;
                const maxTotal = Math.max(...hourlyData.map((d) => d.inbound + d.outbound), 1);
                const heightPct = (total / maxTotal) * 100;
                const inPct = total > 0 ? (h.inbound / total) * 100 : 0;
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full relative rounded-t-sm overflow-hidden" style={{ height: `${Math.max(heightPct, 2)}%` }}>
                      <div className="absolute bottom-0 w-full bg-green-400" style={{ height: `${inPct}%` }} />
                      <div className="absolute top-0 w-full bg-blue-400" style={{ height: `${100 - inPct}%` }} />
                    </div>
                    {h.hour % 3 === 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {h.hour === 0 ? "12a" : h.hour < 12 ? `${h.hour}a` : h.hour === 12 ? "12p" : `${h.hour - 12}p`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-green-400" /> Inbound</div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-blue-400" /> Outbound</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outcome Breakdown */}
      {monthlyReport && monthlyReport.byOutcome.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4 px-4">
            <p className="text-sm font-semibold mb-3">Outcomes (Monthly)</p>
            <div className="flex gap-3">
              {monthlyReport.byOutcome.map((o) => {
                const colors: Record<string, string> = {
                  answered: "bg-green-100 text-green-700 dark:bg-green-900/30",
                  missed: "bg-red-100 text-red-700 dark:bg-red-900/30",
                  voicemail: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30",
                  busy: "bg-orange-100 text-orange-700 dark:bg-orange-900/30",
                  failed: "bg-gray-100 text-gray-700 dark:bg-gray-900/30",
                  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-900/30",
                };
                return (
                  <div key={o.outcome} className={cn("rounded-md px-3 py-2 text-center", colors[o.outcome] || "bg-muted")}>
                    <p className="text-lg font-bold">{o.count}</p>
                    <p className="text-xs capitalize">{o.outcome}</p>
                    <p className="text-[10px] opacity-70">{o.percentage.toFixed(0)}%</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
