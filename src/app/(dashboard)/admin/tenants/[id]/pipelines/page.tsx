"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Plus, Columns3, Phone, MessageSquare, Users,
  Calendar, BarChart3, Bot, Workflow, Settings, Trash2, ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import { PipelineBuilder } from "@/components/pipelines/pipeline-builder";

export default function TenantPipelinesPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const [showBuilder, setShowBuilder] = useState(false);

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  const pipelines = useQuery(
    api.pipelines.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  const updatePipeline = useMutation(api.pipelines.update);
  const removePipeline = useMutation(api.pipelines.remove);

  if (!tenant) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--header-height, 3.5rem))" }}>
      {/* Tenant header with inline nav */}
      <div className="shrink-0 border-b bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}><Button variant="ghost" size="sm" className="gap-2"><Phone className="h-4 w-4" />Calls</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}><Button variant="ghost" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />SMS</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}><Button variant="ghost" size="sm" className="gap-2"><Users className="h-4 w-4" />Contacts</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}><Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/tasks`}><Button variant="ghost" size="sm" className="gap-2"><ClipboardCheck className="h-4 w-4" />Tasks</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}><Button variant="ghost" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}><Button variant="ghost" size="sm" className="gap-2"><Workflow className="h-4 w-4" />Workflows</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/pipelines`}><Button variant="secondary" size="sm" className="gap-2"><Columns3 className="h-4 w-4" />Pipelines</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}><Button variant="ghost" size="sm" className="gap-2"><Bot className="h-4 w-4" />AI Agents</Button></Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}><Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings</Button></Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Pipelines</h1>
            <p className="page-description">Manage sales and process pipelines for {tenant.name}</p>
          </div>
          <Button onClick={() => setShowBuilder(true)}>
            <Plus className="h-4 w-4 mr-1.5" />New Pipeline
          </Button>
        </div>

        {pipelines && pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Columns3 className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold mb-1">No pipelines yet</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create your first pipeline to track contacts through stages.
            </p>
            <Button onClick={() => setShowBuilder(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Create Pipeline
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {(pipelines ?? []).map((pipeline) => (
              <Link
                key={pipeline._id}
                href={`/admin/tenants/${tenant._id}/pipelines/${pipeline._id}`}
                className="flex items-center gap-3 group rounded-lg border bg-card p-4 hover:shadow-sm transition-shadow"
              >
                {pipeline.color && (
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: pipeline.color }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold">{pipeline.name}</span>
                  {pipeline.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{pipeline.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      {pipeline.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
                <Switch
                  checked={pipeline.isActive}
                  onCheckedChange={(checked) => updatePipeline({ id: pipeline._id, isActive: checked })}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm("Delete this pipeline and all its stages?")) {
                      removePipeline({ id: pipeline._id });
                    }
                  }}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showBuilder && (
        <PipelineBuilder
          organizationId={tenant._id}
          onClose={() => setShowBuilder(false)}
          onSaved={() => setShowBuilder(false)}
        />
      )}
    </div>
  );
}
