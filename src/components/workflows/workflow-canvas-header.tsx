"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { WorkflowTriggerSelect } from "./workflow-trigger-select";
import { useCanvasContext } from "./workflow-canvas-provider";
import Link from "next/link";

interface WorkflowCanvasHeaderProps {
  workflowId?: Id<"workflows">;
  basePath?: string;
}

export function WorkflowCanvasHeader({ workflowId, basePath = "/workflows" }: WorkflowCanvasHeaderProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const createWorkflow = useMutation(api.workflows.create);
  const updateWorkflow = useMutation(api.workflows.update);

  const {
    name, setName,
    triggerType, setTriggerType,
    triggerConfig, setTriggerConfig,
    steps,
    isActive, setIsActive,
    organizationId,
  } = useCanvasContext();

  const isEditing = !!workflowId;

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
          id: workflowId,
          name: name.trim(),
          isActive,
          triggerType,
          triggerConfig: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
          steps: stepsData,
        });
      } else {
        const newId = await createWorkflow({
          organizationId,
          name: name.trim(),
          triggerType,
          triggerConfig: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
          steps: stepsData,
        });
        router.push(`${basePath}/${newId}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="shrink-0 border-b bg-background">
      <div className="flex items-center gap-3 px-6 py-3">
        <Link
          href={basePath}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Label htmlFor="active-toggle" className="text-xs text-muted-foreground">
            {isActive ? "Active" : "Inactive"}
          </Label>
          <Switch
            id="active-toggle"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={!name.trim() || steps.length === 0 || isSaving}
          size="sm"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          {isEditing ? "Save" : "Create"}
        </Button>
      </div>
    </div>
  );
}
