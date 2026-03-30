"use client";

import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Loader2, Settings, Phone, MessageSquare, Users,
  Calendar, BarChart3, Bot, FileText, Zap, ChevronRight, Workflow, Columns3, BrainCircuit, ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { cardPatterns } from "@/lib/style-constants";
import { cn } from "@/lib/utils";

export default function TenantAgentsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const tenantId = params.id as string;

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  const leads = useQuery(
    api.insuranceLeads.list,
    tenant?._id ? { organizationId: tenant._id, limit: 200 } : "skip"
  );

  const stats = useQuery(
    api.insuranceQuotes.getStats,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const agentRun = useQuery(
    api.agentRuns.getLatest,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const selectedCarriers = useQuery(
    api.tenantCommissions.getSelectedCarriers,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  // Check platform org for AI configuration
  const platformOrg = useQuery(api.organizations.getPlatformOrg);
  const hasRetellConfigured = !!(platformOrg?.settings as any)?.retellConfigured;
  const hasOpenaiConfigured = !!(platformOrg?.settings as any)?.openaiConfigured;

  // SMS agents for this tenant
  const smsAgents = useQuery(
    api.smsAgents.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );
  const activeSmsAgents = (smsAgents ?? []).filter((a: any) => a.isActive).length;

  if (!userLoaded || tenant === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-on-surface-variant">Tenant not found</p>
      </div>
    );
  }

  const unquotedCount = (leads ?? []).filter((l: any) => l.status === "new").length;
  const hasPortalCreds = (selectedCarriers ?? []).some((tc: any) => tc.portalConfigured);
  const isAgentRunning = agentRun?.status === "running";

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--header-height, 3.5rem))" }}>
      {/* Tenant header with inline nav */}
      <div className="shrink-0 bg-surface px-6 py-3">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Phone className="h-4 w-4" />
                Calls
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Users className="h-4 w-4" />
                Contacts
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                Calendar
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/tasks`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ClipboardCheck className="h-4 w-4" />
                Tasks
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Reports
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Workflow className="h-4 w-4" />
                Workflows
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/pipelines`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Columns3 className="h-4 w-4" />
                Pipelines
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}>
              <Button variant="secondary" size="sm" className="gap-2">
                <Bot className="h-4 w-4" />
                AI Agents
              </Button>
            </Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="page-title">AI Agents</h1>
            <p className="page-description">
              Automated agents that perform tasks for {tenant.name}
            </p>
          </div>

          {/* Agent cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Insurance Quoting Agent */}
            <Link href={`/admin/tenants/${tenant._id}/agents/quotes`}>
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
                    <Badge className="bg-blue-500/15 text-blue-600lue-500/30 text-xs gap-1">
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

            {/* AI Calling Agent */}
            <Link href={`/admin/tenants/${tenant._id}/agents/calling`}>
              <div className={cn(cardPatterns.pageCardInteractive, "group cursor-pointer p-4")}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 dark:bg-cyan-900/30">
                    <Phone className="h-5 w-5 text-cyan-600" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
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
                </div>
              </div>
            </Link>

            {/* AI SMS Agent */}
            <Link href={`/admin/tenants/${tenant._id}/agents/sms`}>
              <div className={cn(cardPatterns.pageCardInteractive, "group cursor-pointer p-4")}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/30">
                    <BrainCircuit className="h-5 w-5 text-violet-600" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
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
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
