"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, Loader2, Ban, Clock,
  Users, Activity,
} from "lucide-react";
import { stepTypeInfo } from "./workflow-step-card";
import type { StepType } from "./workflow-step-card";

interface WorkflowExecutionsPanelProps {
  workflowId: Id<"workflows">;
  workflow: Doc<"workflows"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig = {
  running: { label: "Running", icon: Loader2, color: "text-blue-600", badgeClass: "bg-blue-100 text-blue-700 border-blue-200" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-green-600", badgeClass: "bg-green-100 text-green-700 border-green-200" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-600", badgeClass: "bg-red-100 text-red-700 border-red-200" },
  cancelled: { label: "Cancelled", icon: Ban, color: "text-gray-500", badgeClass: "bg-gray-100 text-gray-600 border-gray-200" },
} as const;

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getCurrentStepLabel(execution: {
  status: string;
  currentStepIndex: number;
  snapshotSteps: { type: string; order: number }[];
}): string {
  if (execution.status === "completed") return "Finished";
  if (execution.status === "failed") return "Failed";
  if (execution.status === "cancelled") return "Cancelled";

  const step = execution.snapshotSteps[execution.currentStepIndex];
  if (!step) return `Step ${execution.currentStepIndex + 1}`;

  const info = stepTypeInfo[step.type as StepType];
  if (!info) return `Step ${execution.currentStepIndex + 1}`;

  if (step.type === "wait") return `Waiting (step ${execution.currentStepIndex + 1})`;
  return `${info.label} (step ${execution.currentStepIndex + 1}/${execution.snapshotSteps.length})`;
}

export function WorkflowExecutionsPanel({
  workflowId,
  workflow,
  open,
  onOpenChange,
}: WorkflowExecutionsPanelProps) {
  const executions = useQuery(
    api.workflowExecutions.getByWorkflowWithContacts,
    open ? { workflowId } : "skip"
  );
  const cancelExecution = useMutation(api.workflowExecutions.cancel);

  const running = executions?.filter((e) => e.status === "running") ?? [];
  const completed = executions?.filter((e) => e.status === "completed") ?? [];
  const failed = executions?.filter((e) => e.status === "failed") ?? [];
  const cancelled = executions?.filter((e) => e.status === "cancelled") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex! flex-col!">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base">
            {workflow?.name ?? "Workflow"} — Contacts
          </DialogTitle>
          {executions && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {executions.length} total
              </span>
              {running.length > 0 && (
                <span className="flex items-center gap-1 text-blue-600">
                  <Activity className="h-3 w-3" />
                  {running.length} active
                </span>
              )}
              {completed.length > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {completed.length} completed
                </span>
              )}
              {failed.length > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="h-3 w-3" />
                  {failed.length} failed
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          {!executions ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
              <Users className="h-8 w-8 mb-2 opacity-40" />
              <p>No contacts have entered this workflow yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {executions.map((ex) => {
                const config = statusConfig[ex.status as keyof typeof statusConfig];
                const StatusIcon = config?.icon ?? Clock;
                const stepLabel = getCurrentStepLabel(ex);

                return (
                  <div
                    key={ex._id}
                    className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <StatusIcon
                      className={`h-4 w-4 shrink-0 ${config?.color ?? "text-gray-500"} ${
                        ex.status === "running" ? "animate-spin" : ""
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {ex.contactName}
                        </span>
                        {ex.contactPhone && (
                          <span className="text-[10px] text-muted-foreground">
                            {ex.contactPhone}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {stepLabel}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          · {formatTimeAgo(ex.startedAt)}
                        </span>
                      </div>
                      {/* Step progress dots */}
                      <div className="flex items-center gap-0.5 mt-1">
                        {ex.snapshotSteps.map((step, i) => {
                          const result = ex.stepResults[i];
                          let dotColor = "bg-gray-200";
                          if (result?.status === "completed") dotColor = "bg-green-500";
                          else if (result?.status === "running") dotColor = "bg-blue-500 animate-pulse";
                          else if (result?.status === "failed") dotColor = "bg-red-500";
                          else if (result?.status === "skipped") dotColor = "bg-yellow-400";

                          const stepInfo = stepTypeInfo[step.type as StepType];
                          return (
                            <div
                              key={step.id}
                              className={`h-1.5 flex-1 rounded-full ${dotColor} max-w-6`}
                              title={`Step ${i + 1}: ${stepInfo?.label ?? step.type} — ${result?.status ?? "pending"}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${config?.badgeClass ?? ""}`}
                      >
                        {config?.label ?? ex.status}
                      </Badge>
                      {ex.status === "running" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                          onClick={() => cancelExecution({ executionId: ex._id })}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
