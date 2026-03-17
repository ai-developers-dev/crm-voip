"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Users, Loader2, CheckCircle2, XCircle, Ban, Activity, Clock,
} from "lucide-react";
import { stepTypeInfo, type StepType } from "./workflow-step-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WorkflowActivityPanelProps {
  workflowId: Id<"workflows">;
}

export function WorkflowActivityPanel({ workflowId }: WorkflowActivityPanelProps) {
  const executions = useQuery(api.workflowExecutions.getByWorkflowWithContacts, { workflowId });
  const cancelExecution = useMutation(api.workflowExecutions.cancel);

  const runningCount = executions?.filter((e) => e.status === "running").length ?? 0;
  const completedCount = executions?.filter((e) => e.status === "completed").length ?? 0;
  const failedCount = executions?.filter((e) => e.status === "failed").length ?? 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/30">
            <Users className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <span className="text-sm font-semibold flex-1">Activity</span>
        </div>

        {/* Summary bar */}
        {executions && executions.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 flex-wrap border-b">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {executions.length}
            </span>
            {runningCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-blue-600">
                <Activity className="h-3 w-3" />
                {runningCount}
              </span>
            )}
            {completedCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                {completedCount}
              </span>
            )}
            {failedCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <XCircle className="h-3 w-3" />
                {failedCount}
              </span>
            )}
          </div>
        )}

        {/* Execution list */}
        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4 pt-2">
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
                        <div className="flex items-center gap-0.5 mt-1.5 max-w-32">
                          {ex.snapshotSteps.map((s: any, i: number) => {
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
                      {ex.status === "running" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => cancelExecution({ executionId: ex._id })}
                              className="p-1 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left"><p>Cancel</p></TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
