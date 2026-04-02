"use client";

import { useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { Loader2, Plus, Workflow, Users, Activity, Trash2, Phone, MessageSquare, Calendar, BarChart3, Bot, Settings, Columns3, ClipboardCheck, FileSignature } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { triggerOptions } from "@/components/workflows/workflow-trigger-select";
import { cardPatterns } from "@/lib/style-constants";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function TenantWorkflowsPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  const workflows = useQuery(
    api.workflows.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const stats = useQuery(
    api.workflowExecutions.getStatsByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const updateWorkflow = useMutation(api.workflows.update);
  const removeWorkflow = useMutation(api.workflows.remove);

  if (!tenant) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin" /><span>Loading...</span></div>
      </div>
    );
  }

  const getTriggerLabel = (type: string) =>
    triggerOptions.find((t) => t.value === type)?.label ?? type;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--header-height, 3.5rem))" }}>
      {/* Tenant header with inline nav */}
      <div className="shrink-0 bg-surface px-6 py-3">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}><Button variant="ghost" size="sm" className="gap-2"><Phone className="h-4 w-4" />Calls</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}><Button variant="ghost" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />SMS</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}><Button variant="ghost" size="sm" className="gap-2"><Users className="h-4 w-4" />Contacts</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}><Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/tasks`}><Button variant="ghost" size="sm" className="gap-2"><ClipboardCheck className="h-4 w-4" />Tasks</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}><Button variant="ghost" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}><Button variant="ghost" size="sm" className="gap-2 border-b-2 border-primary rounded-none"><Workflow className="h-4 w-4" />Workflows</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/pipelines`}><Button variant="ghost" size="sm" className="gap-2"><Columns3 className="h-4 w-4" />Pipelines</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/e-sign`}><Button variant="ghost" size="sm" className="gap-2"><FileSignature className="h-4 w-4" />E-Sign</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}><Button variant="ghost" size="sm" className="gap-2"><Bot className="h-4 w-4" />AI Agents</Button></Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}><Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings</Button></Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Workflows</h1>
            <p className="page-description">Automate actions for {tenant.name}</p>
          </div>
          <Link href={`/admin/tenants/${tenant._id}/workflows/new`}>
            <Button><Plus className="h-4 w-4 mr-1.5" />New Workflow</Button>
          </Link>
        </div>

        {workflows && workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container mb-4">
              <Workflow className="h-7 w-7 text-on-surface-variant" />
            </div>
            <h2 className="text-base font-semibold mb-1">No workflows yet</h2>
            <p className="text-sm text-on-surface-variant mb-4 max-w-sm">Create your first workflow to automate SMS, tasks, tags, and more.</p>
            <Link href={`/admin/tenants/${tenant._id}/workflows/new`}>
              <Button><Plus className="h-4 w-4 mr-1.5" />Create Workflow</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {(workflows ?? []).map((wf) => {
              const wfStats = stats?.[wf._id];
              return (
                <Link key={wf._id} href={`/admin/tenants/${tenant._id}/workflows/${wf._id}`} className={cn(cardPatterns.pageCardInteractive, "group flex items-center gap-3 p-4")}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{wf.name}</span>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">{getTriggerLabel(wf.triggerType)}</Badge>
                      <span className="text-xs text-on-surface-variant">{wf.steps.length} step{wf.steps.length !== 1 ? "s" : ""}</span>
                      <span className="flex items-center gap-1 text-xs text-on-surface-variant"><Users className="h-3.5 w-3.5" />{wfStats?.total ?? 0} contacts</span>
                      {(wfStats?.running ?? 0) > 0 && <span className="flex items-center gap-1 text-xs text-blue-600 font-medium"><Activity className="h-3.5 w-3.5" />{wfStats!.running} active</span>}
                    </div>
                  </div>
                  <Switch checked={wf.isActive} onCheckedChange={(checked) => updateWorkflow({ id: wf._id, isActive: checked })} onClick={(e) => e.stopPropagation()} />
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm("Delete this workflow?")) removeWorkflow({ id: wf._id }); }} className="p-1.5 rounded text-on-surface-variant hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
