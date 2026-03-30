"use client";

import { useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Loader2, Plus, Workflow, Users, Activity, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { triggerOptions } from "@/components/workflows/workflow-trigger-select";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { cardPatterns } from "@/lib/style-constants";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function WorkflowsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const workflows = useQuery(
    api.workflows.getByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const stats = useQuery(
    api.workflowExecutions.getStatsByOrganization,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  const updateWorkflow = useMutation(api.workflows.update);
  const removeWorkflow = useMutation(api.workflows.remove);

  if (!orgLoaded || convexOrg === undefined || workflows === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading workflows...</span>
        </div>
      </div>
    );
  }

  const getTriggerLabel = (type: string) =>
    triggerOptions.find((t) => t.value === type)?.label ?? type;

  return (
    <PageContainer variant="scroll">
      <PageHeader
        title="Workflows"
        description="Automate actions when events happen in your CRM"
        action={
          <Link href="/workflows/new">
            <Button>
              <Plus className="h-4 w-4 mr-1.5" />
              New Workflow
            </Button>
          </Link>
        }
      />

      {/* Workflow list */}
      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container mb-4">
            <Workflow className="h-7 w-7 text-on-surface-variant" />
          </div>
          <h2 className="text-base font-semibold mb-1">No workflows yet</h2>
          <p className="text-sm text-on-surface-variant mb-4 max-w-sm">
            Create your first workflow to automate SMS, tasks, tags, and more when events happen.
          </p>
          <Link href="/workflows/new">
            <Button>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Workflow
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => {
            const wfStats = stats?.[wf._id];
            return (
              <Link
                key={wf._id}
                href={`/workflows/${wf._id}`}
                className={cn(cardPatterns.pageCardInteractive, "group flex items-center gap-3 p-4")}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold">{wf.name}</span>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      {getTriggerLabel(wf.triggerType)}
                    </Badge>
                    <span className="text-xs text-on-surface-variant">
                      {wf.steps.length} step{wf.steps.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                      <Users className="h-3.5 w-3.5" />
                      {wfStats?.total ?? 0} contact{(wfStats?.total ?? 0) !== 1 ? "s" : ""}
                    </span>
                    {(wfStats?.running ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                        <Activity className="h-3.5 w-3.5" />
                        {wfStats!.running} active
                      </span>
                    )}
                  </div>
                </div>
                <Switch
                  checked={wf.isActive}
                  onCheckedChange={(checked) => {
                    updateWorkflow({ id: wf._id, isActive: checked });
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm("Delete this workflow?")) {
                      removeWorkflow({ id: wf._id });
                    }
                  }}
                  className="p-1.5 rounded text-on-surface-variant hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
