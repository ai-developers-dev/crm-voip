"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Phone, FileText, BrainCircuit, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { cardPatterns } from "@/lib/style-constants";
import { cn } from "@/lib/utils";

export default function AIAgentsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const org = useQuery(
    api.organizations.getByClerkId,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const leads = useQuery(
    api.insuranceLeads.list,
    org?._id ? { organizationId: org._id, limit: 200 } : "skip"
  );

  const stats = useQuery(
    api.insuranceQuotes.getStats,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const agentRun = useQuery(
    api.agentRuns.getLatest,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const selectedCarriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const platformOrg = useQuery(api.organizations.getPlatformOrg);
  const hasRetellConfigured = !!(platformOrg?.settings as any)?.retellConfigured;
  const hasOpenaiConfigured = !!(platformOrg?.settings as any)?.openaiConfigured;

  const smsAgents = useQuery(
    api.smsAgents.getByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );
  const activeSmsAgents = (smsAgents ?? []).filter((a: any) => a.isActive).length;

  if (!orgLoaded || org === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  const unquotedCount = (leads ?? []).filter((l: any) => l.status === "new").length;
  const hasPortalCreds = (selectedCarriers ?? []).some((tc: any) => tc.portalConfigured);
  const isAgentRunning = agentRun?.status === "running";

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--header-height, 3.5rem))" }}>
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="page-title">AI Agents</h1>
            <p className="page-description">
              Automated agents that run on your behalf.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Insurance Quoting Agent — has a tenant page */}
            <Link href="/quotes">
              <div className={cn(cardPatterns.pageCardInteractive, "group cursor-pointer p-4")}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
                    <FileText className="h-5 w-5 text-emerald-600" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Insurance Quoting</h3>
                <p className="text-xs text-on-surface-variant mb-3">
                  Automatically runs insurance quotes through National General and other carrier portals using browser automation.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {hasPortalCreds ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">NatGen Connected</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Not configured</Badge>
                  )}
                  {isAgentRunning && (
                    <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs gap-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running
                    </Badge>
                  )}
                  {unquotedCount > 0 && (
                    <Badge variant="outline" className="text-xs">{unquotedCount} unquoted</Badge>
                  )}
                  {stats && stats.successful > 0 && (
                    <Badge variant="outline" className="text-xs">{stats.successful} quoted</Badge>
                  )}
                </div>
              </div>
            </Link>

            {/* AI Calling — placeholder (admin-only configuration) */}
            <div className={cn(cardPatterns.pageCard, "p-4 opacity-75")}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 dark:bg-cyan-900/30">
                  <Phone className="h-5 w-5 text-cyan-600" />
                </div>
              </div>
              <h3 className="text-sm font-semibold mb-1">AI Calling</h3>
              <p className="text-xs text-on-surface-variant mb-3">
                AI-powered inbound and outbound calling agents. Handles receptionists, follow-ups, reminders, and lead qualification.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {hasRetellConfigured ? (
                  <Badge className="bg-cyan-500/15 text-cyan-600 border-cyan-500/30 text-xs">AI Calling Connected</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not configured</Badge>
                )}
                <Badge variant="outline" className="text-xs">Configured by admin</Badge>
              </div>
            </div>

            {/* AI SMS — placeholder */}
            <div className={cn(cardPatterns.pageCard, "p-4 opacity-75")}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/30">
                  <BrainCircuit className="h-5 w-5 text-violet-600" />
                </div>
              </div>
              <h3 className="text-sm font-semibold mb-1">AI SMS</h3>
              <p className="text-xs text-on-surface-variant mb-3">
                AI-powered SMS conversation agents. Book appointments, qualify leads, and handle customer service via text message.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {hasOpenaiConfigured ? (
                  <>
                    <Badge className="bg-violet-500/15 text-violet-600 border-violet-500/30 text-xs">OpenAI Connected</Badge>
                    {activeSmsAgents > 0 && (
                      <Badge variant="outline" className="text-xs">{activeSmsAgents} active</Badge>
                    )}
                  </>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not configured</Badge>
                )}
                <Badge variant="outline" className="text-xs">Configured by admin</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
