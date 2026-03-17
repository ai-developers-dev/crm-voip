"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { WorkflowStep, StepType } from "./workflow-step-card";
import type { TriggerType, TriggerConfig } from "./workflow-trigger-select";
import { Id } from "../../../convex/_generated/dataModel";

export type RightPanelMode = "palette" | "step-detail" | "activity";

interface CanvasState {
  name: string;
  setName: (name: string) => void;
  triggerType: TriggerType;
  setTriggerType: (type: TriggerType) => void;
  triggerConfig: TriggerConfig;
  setTriggerConfig: (config: TriggerConfig) => void;
  steps: WorkflowStep[];
  selectedStepId: string | null;
  rightPanelMode: RightPanelMode;
  isDirty: boolean;
  isActive: boolean;
  setIsActive: (active: boolean) => void;
  insertStep: (type: StepType, index: number) => string;
  removeStep: (id: string) => void;
  updateStep: (updated: WorkflowStep) => void;
  reorderSteps: (oldIndex: number, newIndex: number) => void;
  selectStep: (id: string | null) => void;
  setRightPanelMode: (mode: RightPanelMode) => void;
  organizationId: Id<"organizations">;
}

const CanvasContext = createContext<CanvasState | null>(null);

export function useCanvasContext() {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error("useCanvasContext must be used within WorkflowCanvasProvider");
  return ctx;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

interface ProviderProps {
  children: ReactNode;
  organizationId: Id<"organizations">;
  initialName?: string;
  initialTriggerType?: TriggerType;
  initialTriggerConfig?: TriggerConfig;
  initialSteps?: WorkflowStep[];
  initialIsActive?: boolean;
}

export function WorkflowCanvasProvider({
  children,
  organizationId,
  initialName = "",
  initialTriggerType = "contact_created",
  initialTriggerConfig = {},
  initialSteps = [],
  initialIsActive = false,
}: ProviderProps) {
  const [name, setName] = useState(initialName);
  const [triggerType, setTriggerType] = useState<TriggerType>(initialTriggerType);
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig>(initialTriggerConfig);
  const [steps, setSteps] = useState<WorkflowStep[]>(initialSteps);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>("palette");
  const [isDirty, setIsDirty] = useState(false);
  const [isActive, setIsActive] = useState(initialIsActive);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const insertStep = useCallback((type: StepType, index: number) => {
    const id = generateId();
    const newStep: WorkflowStep = {
      id,
      order: 0,
      type,
      config: type === "wait" ? { waitMinutes: 1440 } :
              type === "create_task" ? { taskType: "follow_up", taskPriority: "medium", taskDueDays: 1 } :
              {},
    };
    setSteps((prev) => {
      const updated = [...prev];
      updated.splice(index, 0, newStep);
      return updated.map((s, i) => ({ ...s, order: i }));
    });
    setSelectedStepId(id);
    setRightPanelMode("step-detail");
    markDirty();
    return id;
  }, [markDirty]);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })));
    setSelectedStepId((prev) => prev === id ? null : prev);
    if (selectedStepId === id) setRightPanelMode("palette");
    markDirty();
  }, [selectedStepId, markDirty]);

  const updateStep = useCallback((updated: WorkflowStep) => {
    setSteps((prev) => prev.map((s) => s.id === updated.id ? updated : s));
    markDirty();
  }, [markDirty]);

  const reorderSteps = useCallback((oldIndex: number, newIndex: number) => {
    setSteps((prev) => arrayMove(prev, oldIndex, newIndex).map((s, i) => ({ ...s, order: i })));
    markDirty();
  }, [markDirty]);

  const selectStep = useCallback((id: string | null) => {
    setSelectedStepId(id);
    setRightPanelMode(id ? "step-detail" : "palette");
  }, []);

  const handleSetName = useCallback((v: string) => { setName(v); markDirty(); }, [markDirty]);
  const handleSetTriggerType = useCallback((v: TriggerType) => { setTriggerType(v); markDirty(); }, [markDirty]);
  const handleSetTriggerConfig = useCallback((v: TriggerConfig) => { setTriggerConfig(v); markDirty(); }, [markDirty]);
  const handleSetIsActive = useCallback((v: boolean) => { setIsActive(v); markDirty(); }, [markDirty]);

  return (
    <CanvasContext.Provider
      value={{
        name,
        setName: handleSetName,
        triggerType,
        setTriggerType: handleSetTriggerType,
        triggerConfig,
        setTriggerConfig: handleSetTriggerConfig,
        steps,
        selectedStepId,
        rightPanelMode,
        isDirty,
        isActive,
        setIsActive: handleSetIsActive,
        insertStep,
        removeStep,
        updateStep,
        reorderSteps,
        selectStep,
        setRightPanelMode,
        organizationId,
      }}
    >
      {children}
    </CanvasContext.Provider>
  );
}
