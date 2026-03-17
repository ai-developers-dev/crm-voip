"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Users, CheckCircle2, XCircle, Loader2, Ban, Activity, Clock,
  Zap, ListOrdered, X, Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { WorkflowTriggerSelect, triggerOptions, type TriggerType, type TriggerConfig } from "./workflow-trigger-select";
import { WorkflowStepCard, stepTypeInfo, type WorkflowStep, type StepType } from "./workflow-step-card";
import { WorkflowStepEditor } from "./workflow-step-editor";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow?: Doc<"workflows"> | null;
  organizationId: Id<"organizations">;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function WorkflowDialog({
  open,
  onOpenChange,
  workflow,
  organizationId,
}: WorkflowDialogProps) {
  const isEditing = !!workflow;

  const [name, setName] = useState(workflow?.name ?? "");
  const [triggerType, setTriggerType] = useState<TriggerType>(workflow?.triggerType ?? "contact_created");
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig>(
    (workflow?.triggerConfig as TriggerConfig) ?? {}
  );
  const [steps, setSteps] = useState<WorkflowStep[]>(
    (workflow?.steps as WorkflowStep[]) ?? []
  );
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const createWorkflow = useMutation(api.workflows.create);
  const updateWorkflow = useMutation(api.workflows.update);
  const cancelExecution = useMutation(api.workflowExecutions.cancel);
  const executions = useQuery(
    api.workflowExecutions.getByWorkflowWithContacts,
    isEditing ? { workflowId: workflow._id } : "skip"
  );

  const handleAddStep = (insertAfterIndex?: number) => {
    const newStep: WorkflowStep = {
      id: generateId(),
      order: 0,
      type: "send_sms",
      config: {},
    };
    if (insertAfterIndex !== undefined) {
      const updated = [...steps];
      updated.splice(insertAfterIndex + 1, 0, newStep);
      setSteps(updated.map((s, i) => ({ ...s, order: i })));
    } else {
      newStep.order = steps.length;
      setSteps([...steps, newStep]);
    }
    setEditingStepId(newStep.id);
  };

  const handleUpdateStep = (updated: WorkflowStep) => {
    setSteps(steps.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleDeleteStep = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })));
    if (editingStepId === id) setEditingStepId(null);
  };

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return;
    setIsSaving(true);
    try {
      const stepsData = steps.map((s) => ({
        id: s.id,
        order: s.order,
        type: s.type as any,
        config: {
          ...s.config,
          tagId: s.config.tagId ? (s.config.tagId as Id<"contactTags">) : undefined,
          assignToUserId: s.config.assignToUserId ? (s.config.assignToUserId as Id<"users">) : undefined,
        },
      }));

      if (isEditing) {
        await updateWorkflow({
          id: workflow._id,
          name: name.trim(),
          triggerType,
          triggerConfig: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
          steps: stepsData,
        });
      } else {
        await createWorkflow({
          organizationId,
          name: name.trim(),
          triggerType,
          triggerConfig: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
          steps: stepsData,
        });
      }
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setName(workflow?.name ?? "");
      setTriggerType(workflow?.triggerType ?? "contact_created");
      setTriggerConfig((workflow?.triggerConfig as TriggerConfig) ?? {});
      setSteps((workflow?.steps as WorkflowStep[]) ?? []);
      setEditingStepId(null);
      setActivityOpen(false);
    }
    onOpenChange(open);
  };

  const triggerLabel = triggerOptions.find((t) => t.value === triggerType)?.label;

  const runningCount = executions?.filter((e) => e.status === "running").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={`max-h-[85vh] overflow-hidden flex! flex-row! p-0 gap-0 transition-[max-width] duration-300 ease-in-out ${isEditing ? (activityOpen ? "sm:max-w-[1020px]" : "sm:max-w-[680px]") : "sm:max-w-2xl"}`}
      >
        {/* Main dialog body */}
        <div className="flex-1 min-w-[420px] flex flex-col p-6">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base">
                {isEditing ? "Edit Workflow" : "Create Workflow"}
              </DialogTitle>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xs opacity-70 transition-opacity hover:opacity-100 ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            {isEditing && (
              <DialogDescription className="flex items-center gap-2 text-xs">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{triggerLabel}</Badge>
                <span>{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
                {workflow.isActive ? (
                  <span className="text-green-600 font-medium">Active</span>
                ) : (
                  <span className="text-muted-foreground">Inactive</span>
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 mt-4">
            <div className="space-y-4 pb-4">
              {/* Name */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Workflow Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Follow Up New Leads"
                  className="h-9 text-sm"
                />
              </div>

              {/* Trigger Section */}
              <div className="rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-100 dark:bg-cyan-900/30">
                    <Zap className="h-3.5 w-3.5 text-cyan-600" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">When this happens...</span>
                </div>
                <WorkflowTriggerSelect
                  triggerType={triggerType}
                  triggerConfig={triggerConfig}
                  organizationId={organizationId}
                  onTriggerTypeChange={setTriggerType}
                  onTriggerConfigChange={setTriggerConfig}
                />
              </div>

              {/* Steps Section */}
              <div className="rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/30">
                    <ListOrdered className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">Then do this...</span>
                </div>

                {steps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <ListOrdered className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground mb-3">
                      Add your first step to build the workflow
                    </p>
                  </div>
                ) : (
                  <div>
                    {steps.map((step, i) => (
                      <div key={step.id}>
                        {editingStepId === step.id ? (
                          <WorkflowStepEditor
                            step={step}
                            organizationId={organizationId}
                            onChange={handleUpdateStep}
                            onDone={() => setEditingStepId(null)}
                            onCancel={() => {
                              if (!step.config.messageTemplate && !step.config.emailSubject &&
                                  !step.config.taskTitle && !step.config.tagId &&
                                  !step.config.noteTemplate && !step.config.assignToUserId &&
                                  !step.config.waitMinutes) {
                                handleDeleteStep(step.id);
                              } else {
                                setEditingStepId(null);
                              }
                            }}
                          />
                        ) : (
                          <WorkflowStepCard
                            step={step}
                            index={i}
                            isLast={i === steps.length - 1}
                            onEdit={() => setEditingStepId(step.id)}
                            onDelete={() => handleDeleteStep(step.id)}
                            onInsertAfter={() => handleAddStep(i)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleAddStep()}
                  className="w-full mt-2 rounded-lg border-2 border-dashed border-border/60 p-3 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Add a step
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || steps.length === 0 || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? "Save Changes" : "Create Workflow"}
            </Button>
          </DialogFooter>
        </div>

        {/* Right-side icon strip + sliding activity panel (edit mode only) */}
        {isEditing && (
          <TooltipProvider delayDuration={200}>
            {/* Icon strip */}
            <div className="flex flex-col items-center gap-1 pt-14 pb-4 px-1.5 border-l bg-muted/30 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setActivityOpen(!activityOpen)}
                    className={`relative h-10 w-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                      activityOpen
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Users className="h-5 w-5" />
                    {runningCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                        {runningCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Contact Activity</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Sliding activity panel */}
            <div
              className={`shrink-0 border-l bg-background overflow-hidden transition-[width] duration-300 ease-in-out ${
                activityOpen ? "w-[340px]" : "w-0"
              }`}
            >
              <div className="w-[340px] h-full flex flex-col">
                {/* Panel header */}
                <div className="flex items-center justify-between px-4 pt-5 pb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/30">
                      <Users className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <span className="text-sm font-semibold">Activity</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActivityOpen(false)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Summary bar */}
                {executions && executions.length > 0 && (
                  <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {executions.length}
                    </span>
                    {executions.filter((e) => e.status === "running").length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-blue-600">
                        <Activity className="h-3 w-3" />
                        {executions.filter((e) => e.status === "running").length}
                      </span>
                    )}
                    {executions.filter((e) => e.status === "completed").length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        {executions.filter((e) => e.status === "completed").length}
                      </span>
                    )}
                    {executions.filter((e) => e.status === "failed").length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <XCircle className="h-3 w-3" />
                        {executions.filter((e) => e.status === "failed").length}
                      </span>
                    )}
                  </div>
                )}

                {/* Execution list */}
                <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
                  {!executions ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </div>
                  ) : executions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Users className="h-8 w-8 text-muted-foreground/20 mb-2" />
                      <p className="text-xs text-muted-foreground">
                        No contacts have entered this workflow yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {executions.map((ex) => {
                        const statusIcons = {
                          running: { Icon: Loader2, color: "text-blue-600", spin: true },
                          completed: { Icon: CheckCircle2, color: "text-green-600", spin: false },
                          failed: { Icon: XCircle, color: "text-red-600", spin: false },
                          cancelled: { Icon: Ban, color: "text-gray-500", spin: false },
                        } as const;
                        const si = statusIcons[ex.status as keyof typeof statusIcons] ?? { Icon: Clock, color: "text-gray-500", spin: false };

                        let stepLabel = "Finished";
                        if (ex.status === "running") {
                          const step = ex.snapshotSteps[ex.currentStepIndex];
                          if (step) {
                            const info = stepTypeInfo[step.type as StepType];
                            stepLabel = step.type === "wait"
                              ? `Waiting (${ex.currentStepIndex + 1}/${ex.snapshotSteps.length})`
                              : `${info?.label ?? step.type} (${ex.currentStepIndex + 1}/${ex.snapshotSteps.length})`;
                          }
                        } else if (ex.status === "failed") {
                          stepLabel = "Failed";
                        } else if (ex.status === "cancelled") {
                          stepLabel = "Cancelled";
                        }

                        const diff = Date.now() - ex.startedAt;
                        const mins = Math.floor(diff / 60000);
                        let timeAgo = "just now";
                        if (mins >= 1440) timeAgo = `${Math.floor(mins / 1440)}d ago`;
                        else if (mins >= 60) timeAgo = `${Math.floor(mins / 60)}h ago`;
                        else if (mins >= 1) timeAgo = `${mins}m ago`;

                        return (
                          <div key={ex._id} className="group rounded-lg p-2.5 hover:bg-muted/40 transition-colors">
                            <div className="flex items-start gap-2.5">
                              <si.Icon className={`h-4 w-4 shrink-0 mt-0.5 ${si.color} ${si.spin ? "animate-spin" : ""}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium truncate">{ex.contactName}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">{stepLabel}</span>
                                {/* Segmented progress bar */}
                                <div className="flex items-center gap-0.5 mt-1.5 max-w-32">
                                  {ex.snapshotSteps.map((s, i) => {
                                    const result = ex.stepResults[i];
                                    let barColor = "bg-gray-200 dark:bg-gray-700";
                                    if (result?.status === "completed") barColor = "bg-green-500";
                                    else if (result?.status === "running") barColor = "bg-blue-500 animate-pulse";
                                    else if (result?.status === "failed") barColor = "bg-red-500";
                                    else if (result?.status === "skipped") barColor = "bg-yellow-400";
                                    return <div key={s.id} className={`h-1.5 flex-1 rounded-full ${barColor}`} />;
                                  })}
                                </div>
                              </div>
                              {/* Actions */}
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {ex.status === "running" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => cancelExecution({ executionId: ex._id })}
                                        className="p-1 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                      >
                                        <Ban className="h-3.5 w-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left"><p>Cancel</p></TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => cancelExecution({ executionId: ex._id })}
                                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left"><p>Remove from workflow</p></TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TooltipProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
