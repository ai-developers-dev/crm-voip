"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { type WorkflowStep, type StepType, type BranchDef, type ConditionDef, normalizeBranches } from "./workflow-step-card";
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
  // Branch-aware functions
  findStepById: (id: string) => WorkflowStep | null;
  insertBranchStep: (parentStepId: string, branchId: string, type: StepType) => string;
  removeBranchStep: (parentStepId: string, branchId: string, stepId: string) => void;
  updateBranchStep: (stepId: string, updated: WorkflowStep) => void;
  // Multi-branch management
  addBranch: (parentStepId: string) => string;
  removeBranch: (parentStepId: string, branchId: string) => void;
  renameBranch: (parentStepId: string, branchId: string, name: string) => void;
  updateBranchConditions: (parentStepId: string, branchId: string, conditions: ConditionDef[], logic: "and" | "or") => void;
  reorderBranchSteps: (parentStepId: string, branchId: string, oldIndex: number, newIndex: number) => void;
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

/** Get branches from a step's config (always returns branches[] format) */
function getBranches(step: WorkflowStep): BranchDef[] {
  return normalizeBranches(step.config);
}

/** Update a specific branch within a step's config */
function updateStepBranches(step: WorkflowStep, updater: (branches: BranchDef[]) => BranchDef[]): WorkflowStep {
  const branches = getBranches(step);
  const updated = updater(branches);
  return {
    ...step,
    config: {
      ...step.config,
      branches: updated,
      // Clear legacy fields when using new format
      conditions: undefined,
      conditionLogic: undefined,
      yesBranch: undefined,
      noBranch: undefined,
    },
  };
}

/** Recursively update a branch inside a nested if_else step */
function updateNestedBranch(
  step: WorkflowStep,
  targetParentId: string,
  updater: (branches: BranchDef[]) => BranchDef[]
): WorkflowStep {
  if (step.type !== "if_else") return step;

  const branches = getBranches(step);
  let changed = false;

  const updatedBranches = branches.map((branch) => {
    const updatedSteps = branch.steps.map((child) => {
      if (child.id === targetParentId && child.type === "if_else") {
        changed = true;
        return updateStepBranches(child, updater);
      }
      const nested = updateNestedBranch(child, targetParentId, updater);
      if (nested !== child) changed = true;
      return nested;
    });
    return { ...branch, steps: updatedSteps };
  });

  if (!changed) return step;
  return {
    ...step,
    config: {
      ...step.config,
      branches: updatedBranches,
      conditions: undefined,
      conditionLogic: undefined,
      yesBranch: undefined,
      noBranch: undefined,
    },
  };
}

/** If any condition step has top-level steps after it, absorb them into its first branch */
function absorbStepsAfterConditions(steps: WorkflowStep[]): WorkflowStep[] {
  const conditionIdx = steps.findIndex(s => s.type === "if_else");
  if (conditionIdx === -1 || conditionIdx === steps.length - 1) return steps;
  // Move everything after the condition into its first branch
  const before = steps.slice(0, conditionIdx);
  const conditionStep = steps[conditionIdx];
  const after = steps.slice(conditionIdx + 1);
  const branches = getBranches(conditionStep);
  const firstNamed = branches.find(b => !b.isDefault);
  if (firstNamed) {
    // Deduplicate by step ID — don't add steps already in the branch
    const existingIds = new Set(firstNamed.steps.map(s => s.id));
    const newSteps = after.filter(s => !existingIds.has(s.id));
    firstNamed.steps = [...firstNamed.steps, ...newSteps].map((s, i) => ({ ...s, order: i }));
  }
  return [...before, {
    ...conditionStep,
    config: { ...conditionStep.config, branches, conditions: undefined, conditionLogic: undefined, yesBranch: undefined, noBranch: undefined },
  }].map((s, i) => ({ ...s, order: i }));
}

function createDefaultBranches(): BranchDef[] {
  return [
    { id: generateId(), name: "Branch", conditions: [], conditionLogic: "and", steps: [] },
    { id: generateId(), name: "None", conditions: [], conditionLogic: "and", steps: [], isDefault: true },
  ];
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
  const [steps, setSteps] = useState<WorkflowStep[]>(() => {
    // Normalize: if a condition has top-level steps after it, absorb them into its first branch
    return absorbStepsAfterConditions(initialSteps);
  });
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>("palette");
  const [isDirty, setIsDirty] = useState(false);
  const [isActive, setIsActive] = useState(initialIsActive);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const insertStep = useCallback((type: StepType, index: number) => {
    const id = generateId();

    if (type === "if_else") {
      // When inserting a condition, move all steps after it into the first branch
      setSteps((prev) => {
        const before = prev.slice(0, index);
        const after = prev.slice(index); // steps that should go into first branch
        const branches = createDefaultBranches();
        // Move subsequent steps into the first named branch
        branches[0].steps = after.map((s, i) => ({ ...s, order: i }));
        const newStep: WorkflowStep = {
          id,
          order: 0,
          type: "if_else",
          config: { branches },
        };
        return [...before, newStep].map((s, i) => ({ ...s, order: i }));
      });
    } else {
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
    }

    setSelectedStepId(id);
    setRightPanelMode("step-detail");
    markDirty();
    return id;
  }, [markDirty]);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.type === "if_else") {
        // When removing a condition, unwrap the first branch's steps back to top level
        const branches = getBranches(target);
        const firstBranch = branches.find(b => !b.isDefault) || branches[0];
        const unwrapped = firstBranch?.steps || [];
        const idx = prev.indexOf(target);
        const before = prev.slice(0, idx);
        const after = prev.slice(idx + 1);
        return [...before, ...unwrapped, ...after].map((s, i) => ({ ...s, order: i }));
      }
      return prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
    });
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

  // Recursively find a step by ID across top-level steps and nested branches
  const findStepById = useCallback((id: string): WorkflowStep | null => {
    function search(steps: WorkflowStep[]): WorkflowStep | null {
      for (const s of steps) {
        if (s.id === id) return s;
        if (s.type === "if_else") {
          const branches = getBranches(s);
          for (const branch of branches) {
            const found = search(branch.steps);
            if (found) return found;
          }
        }
      }
      return null;
    }
    return search(steps);
  }, [steps]);

  // Insert a step into a branch of an if_else step
  const insertBranchStep = useCallback((parentStepId: string, branchId: string, type: StepType): string => {
    const id = generateId();
    const newStep: WorkflowStep = {
      id,
      order: 0,
      type,
      config: type === "wait" ? { waitMinutes: 1440 } :
              type === "create_task" ? { taskType: "follow_up", taskPriority: "medium", taskDueDays: 1 } :
              type === "if_else" ? { branches: createDefaultBranches() } :
              {},
    };

    const branchUpdater = (branches: BranchDef[]) =>
      branches.map((b) =>
        b.id === branchId ? { ...b, steps: [...b.steps, newStep] } : b
      );

    setSteps((prev) => prev.map((s) => {
      if (s.id === parentStepId && s.type === "if_else") {
        return updateStepBranches(s, branchUpdater);
      }
      if (s.type === "if_else") {
        return updateNestedBranch(s, parentStepId, branchUpdater);
      }
      return s;
    }));

    setSelectedStepId(id);
    setRightPanelMode("step-detail");
    markDirty();
    return id;
  }, [markDirty]);

  // Remove a step from a branch
  const removeBranchStep = useCallback((parentStepId: string, branchId: string, stepId: string) => {
    const branchUpdater = (branches: BranchDef[]) =>
      branches.map((b) =>
        b.id === branchId ? { ...b, steps: b.steps.filter((bs) => bs.id !== stepId) } : b
      );

    setSteps((prev) => prev.map((s) => {
      if (s.id === parentStepId && s.type === "if_else") {
        return updateStepBranches(s, branchUpdater);
      }
      if (s.type === "if_else") {
        return updateNestedBranch(s, parentStepId, branchUpdater);
      }
      return s;
    }));

    setSelectedStepId((prev) => prev === stepId ? null : prev);
    markDirty();
  }, [markDirty]);

  // Update a step inside any branch (recursive search by stepId)
  const updateBranchStep = useCallback((stepId: string, updated: WorkflowStep) => {
    function updateInSteps(steps: WorkflowStep[]): WorkflowStep[] {
      return steps.map((s) => {
        if (s.id === stepId) return updated;
        if (s.type === "if_else") {
          const branches = getBranches(s);
          const updatedBranches = branches.map((b) => ({
            ...b,
            steps: updateInSteps(b.steps),
          }));
          return {
            ...s,
            config: {
              ...s.config,
              branches: updatedBranches,
              conditions: undefined,
              conditionLogic: undefined,
              yesBranch: undefined,
              noBranch: undefined,
            },
          };
        }
        return s;
      });
    }
    setSteps((prev) => updateInSteps(prev));
    markDirty();
  }, [markDirty]);

  // Add a new named branch before the "None" branch (max 10)
  const addBranch = useCallback((parentStepId: string): string => {
    const newBranchId = generateId();

    const branchUpdater = (branches: BranchDef[]) => {
      const namedCount = branches.filter((b) => !b.isDefault).length;
      if (namedCount >= 10) return branches; // Max 10 named branches
      const newBranch: BranchDef = {
        id: newBranchId,
        name: `Branch ${namedCount + 1}`,
        conditions: [],
        conditionLogic: "and",
        steps: [],
      };
      // Insert before the "None" (default) branch
      const defaultIdx = branches.findIndex((b) => b.isDefault);
      if (defaultIdx >= 0) {
        const result = [...branches];
        result.splice(defaultIdx, 0, newBranch);
        return result;
      }
      return [...branches, newBranch];
    };

    setSteps((prev) => prev.map((s) => {
      if (s.id === parentStepId && s.type === "if_else") {
        return updateStepBranches(s, branchUpdater);
      }
      if (s.type === "if_else") {
        return updateNestedBranch(s, parentStepId, branchUpdater);
      }
      return s;
    }));

    markDirty();
    return newBranchId;
  }, [markDirty]);

  // Remove a branch (cannot remove "None" or last named branch)
  const removeBranch = useCallback((parentStepId: string, branchId: string) => {
    const branchUpdater = (branches: BranchDef[]) => {
      const target = branches.find((b) => b.id === branchId);
      if (!target || target.isDefault) return branches; // Can't remove None
      const namedCount = branches.filter((b) => !b.isDefault).length;
      if (namedCount <= 1) return branches; // Must keep at least 1 named branch
      return branches.filter((b) => b.id !== branchId);
    };

    setSteps((prev) => prev.map((s) => {
      if (s.id === parentStepId && s.type === "if_else") {
        return updateStepBranches(s, branchUpdater);
      }
      if (s.type === "if_else") {
        return updateNestedBranch(s, parentStepId, branchUpdater);
      }
      return s;
    }));

    markDirty();
  }, [markDirty]);

  // Rename a branch
  const renameBranch = useCallback((parentStepId: string, branchId: string, newName: string) => {
    const branchUpdater = (branches: BranchDef[]) =>
      branches.map((b) => b.id === branchId ? { ...b, name: newName } : b);

    setSteps((prev) => prev.map((s) => {
      if (s.id === parentStepId && s.type === "if_else") {
        return updateStepBranches(s, branchUpdater);
      }
      if (s.type === "if_else") {
        return updateNestedBranch(s, parentStepId, branchUpdater);
      }
      return s;
    }));

    markDirty();
  }, [markDirty]);

  // Update conditions/logic on a specific branch
  const updateBranchConditions = useCallback((parentStepId: string, branchId: string, conditions: ConditionDef[], logic: "and" | "or") => {
    const branchUpdater = (branches: BranchDef[]) =>
      branches.map((b) => b.id === branchId ? { ...b, conditions, conditionLogic: logic } : b);

    setSteps((prev) => prev.map((s) => {
      if (s.id === parentStepId && s.type === "if_else") {
        return updateStepBranches(s, branchUpdater);
      }
      if (s.type === "if_else") {
        return updateNestedBranch(s, parentStepId, branchUpdater);
      }
      return s;
    }));

    markDirty();
  }, [markDirty]);

  // Reorder steps within a branch
  const reorderBranchSteps = useCallback((parentStepId: string, branchId: string, oldIndex: number, newIndex: number) => {
    const branchUpdater = (branches: BranchDef[]) =>
      branches.map((b) => {
        if (b.id !== branchId) return b;
        const reordered = [...b.steps];
        const [item] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, item);
        return { ...b, steps: reordered.map((s, i) => ({ ...s, order: i })) };
      });

    setSteps((prev) => prev.map((s) => {
      if (s.id === parentStepId && s.type === "if_else") {
        return updateStepBranches(s, branchUpdater);
      }
      if (s.type === "if_else") {
        return updateNestedBranch(s, parentStepId, branchUpdater);
      }
      return s;
    }));

    markDirty();
  }, [markDirty]);

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
        findStepById,
        insertBranchStep,
        removeBranchStep,
        updateBranchStep,
        addBranch,
        removeBranch,
        renameBranch,
        updateBranchConditions,
        reorderBranchSteps,
      }}
    >
      {children}
    </CanvasContext.Provider>
  );
}
