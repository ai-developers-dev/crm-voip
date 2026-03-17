"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Users, Activity } from "lucide-react";
import { WorkflowDialog } from "./workflow-dialog";
import { WorkflowExecutionsPanel } from "./workflow-executions-panel";
import { triggerOptions } from "./workflow-trigger-select";

interface WorkflowListProps {
  workflows: Doc<"workflows">[];
  organizationId: Id<"organizations">;
}

export function WorkflowList({ workflows, organizationId }: WorkflowListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Doc<"workflows"> | null>(null);
  const [viewingWorkflowId, setViewingWorkflowId] = useState<Id<"workflows"> | null>(null);

  const updateWorkflow = useMutation(api.workflows.update);
  const removeWorkflow = useMutation(api.workflows.remove);
  const stats = useQuery(api.workflowExecutions.getStatsByOrganization, { organizationId });

  const handleEdit = (workflow: Doc<"workflows">) => {
    setEditingWorkflow(workflow);
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingWorkflow(null);
    setIsDialogOpen(true);
  };

  const getTriggerLabel = (type: string) => {
    return triggerOptions.find((t) => t.value === type)?.label ?? type;
  };

  return (
    <div className="space-y-4">
      {workflows.length > 0 && (
        <div className="space-y-2">
          {workflows.map((wf) => {
            const wfStats = stats?.[wf._id];
            return (
              <div
                key={wf._id}
                className="flex items-center gap-3 group rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => handleEdit(wf)}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold">{wf.name}</span>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      {getTriggerLabel(wf.triggerType)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {wf.steps.length} step{wf.steps.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
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
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(wf); }}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeWorkflow({ id: wf._id }); }}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-1 border-t border-border/40">
        <Button variant="outline" size="sm" className="w-full" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Workflow
        </Button>
      </div>

      <WorkflowDialog
        key={editingWorkflow?._id ?? "new"}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        workflow={editingWorkflow}
        organizationId={organizationId}
      />

      {viewingWorkflowId && (
        <WorkflowExecutionsPanel
          workflowId={viewingWorkflowId}
          workflow={workflows.find((w) => w._id === viewingWorkflowId) ?? null}
          open={!!viewingWorkflowId}
          onOpenChange={(open) => { if (!open) setViewingWorkflowId(null); }}
        />
      )}
    </div>
  );
}
