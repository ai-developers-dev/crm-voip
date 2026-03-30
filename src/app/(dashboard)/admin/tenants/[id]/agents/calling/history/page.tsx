"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/layout/stat-card";
import {
  Loader2, Phone, Bot, Settings, ArrowLeft, ChevronDown, ChevronUp,
  MessageSquare, Users, Calendar, BarChart3, Workflow,
  PhoneOutgoing, PhoneIncoming, Clock, DollarSign, ThumbsUp, BarChart,
} from "lucide-react";
import Link from "next/link";

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  if (sentiment === "Positive") return <Badge variant="success" className="text-[10px]">Positive</Badge>;
  if (sentiment === "Negative") return <Badge variant="destructive" className="text-[10px]">Negative</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{sentiment || "Unknown"}</Badge>;
}

export default function AICallHistoryPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantId = params.id as string;
  const filterAgentId = searchParams.get("agentId");

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  const calls = useQuery(
    api.aiCallHistory.getByOrganization,
    tenant?._id ? { organizationId: tenant._id, limit: 100 } : "skip"
  );

  const stats = useQuery(
    api.aiCallHistory.getStats,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  if (!tenant) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin" /><span>Loading...</span></div>
      </div>
    );
  }

  const filteredCalls = filterAgentId
    ? (calls ?? []).filter((c: any) => c.retellAgentId === filterAgentId)
    : (calls ?? []);

  return (
    <div className="page-full">
      {/* Tenant header */}
      <div className="shrink-0 bg-surface px-6 py-3">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}><Button variant="ghost" size="sm" className="gap-2"><Phone className="h-4 w-4" />Calls</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}><Button variant="ghost" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />SMS</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}><Button variant="ghost" size="sm" className="gap-2"><Users className="h-4 w-4" />Contacts</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}><Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}><Button variant="ghost" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}><Button variant="ghost" size="sm" className="gap-2"><Workflow className="h-4 w-4" />Workflows</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}><Button variant="secondary" size="sm" className="gap-2"><Bot className="h-4 w-4" />AI Agents</Button></Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}><Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings</Button></Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/admin/tenants/${tenant._id}/agents/calling`} className="flex h-8 w-8 items-center justify-center rounded-2xl hover:bg-surface-container-high transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="page-title">AI Call History</h1>
            <p className="page-description">Transcripts, recordings, and analysis for AI calls</p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="stats-grid">
            <StatCard icon={Phone} label="Total Calls" value={stats.totalCalls} />
            <StatCard icon={Clock} label="Avg Duration" value={stats.avgDurationMs ? `${Math.round(stats.avgDurationMs / 1000)}s` : "--"} />
            <StatCard icon={ThumbsUp} label="Success Rate" value={`${stats.successRate}%`} valueClassName="text-emerald-600" />
            <StatCard icon={DollarSign} label="Total Cost" value={stats.totalCostCents ? `$${(stats.totalCostCents / 100).toFixed(2)}` : "--"} />
          </div>
        )}

        {/* Call list */}
        <div className="rounded-xl border bg-surface-container-lowest overflow-hidden">
          {calls === undefined ? (
            <div className="p-8 text-center text-on-surface-variant text-sm">Loading calls...</div>
          ) : filteredCalls.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Phone className="h-8 w-8 text-on-surface-variant/30 mx-auto" />
              <p className="text-sm text-on-surface-variant">No AI calls yet.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-surface-container/20">
                  <th className="px-4 py-3 text-left section-heading">Direction</th>
                  <th className="px-4 py-3 text-left section-heading">Contact</th>
                  <th className="px-4 py-3 text-left section-heading">Duration</th>
                  <th className="px-4 py-3 text-left section-heading">Sentiment</th>
                  <th className="px-4 py-3 text-left section-heading">Outcome</th>
                  <th className="px-4 py-3 text-left section-heading">Date</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call: any) => (
                  <tr key={call._id}>
                    <td className="px-4 py-3">
                      {call.direction === "inbound" ? (
                        <span className="flex items-center gap-1.5 text-sm"><PhoneIncoming className="h-3.5 w-3.5 text-green-500" />Inbound</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm"><PhoneOutgoing className="h-3.5 w-3.5 text-blue-500" />Outbound</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{call.contactName || call.toNumber || call.fromNumber}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{call.durationMs ? `${Math.round(call.durationMs / 1000)}s` : "--"}</td>
                    <td className="px-4 py-3"><SentimentBadge sentiment={call.userSentiment} /></td>
                    <td className="px-4 py-3">
                      {call.callSuccessful === true ? <Badge variant="success" className="text-[10px]">Success</Badge> :
                       call.callSuccessful === false ? <Badge variant="destructive" className="text-[10px]">Failed</Badge> :
                       <Badge variant="secondary" className="text-[10px]">{call.status}</Badge>}
                    </td>
                    <td className="px-4 py-3 caption-text">{new Date(call.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setExpandedCallId(expandedCallId === call._id ? null : call._id)}>
                        {expandedCallId === call._id ? <ChevronUp className="h-4 w-4 text-on-surface-variant" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
