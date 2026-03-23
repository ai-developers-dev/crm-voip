"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Condition field definitions
// ---------------------------------------------------------------------------
interface FieldDef {
  id: string;
  label: string;
  type: "string" | "boolean" | "tag_select" | "user_select" | "pipeline_select" | "stage_select" | "select" | "number";
  options?: string[];
}

interface FieldCategory {
  id: string;
  label: string;
  fields: FieldDef[];
}

export const CONDITION_FIELD_CATEGORIES: FieldCategory[] = [
  {
    id: "contact_info", label: "Contact Info",
    fields: [
      { id: "firstName", label: "First Name", type: "string" },
      { id: "lastName", label: "Last Name", type: "string" },
      { id: "company", label: "Company", type: "string" },
      { id: "email", label: "Email", type: "string" },
      { id: "city", label: "City", type: "string" },
      { id: "state", label: "State", type: "string" },
      { id: "zipCode", label: "Zip Code", type: "string" },
      { id: "dateOfBirth", label: "Date of Birth", type: "string" },
      { id: "gender", label: "Gender", type: "string" },
      { id: "maritalStatus", label: "Marital Status", type: "string" },
    ],
  },
  {
    id: "tags", label: "Tags",
    fields: [{ id: "has_tag", label: "Contact Tag", type: "tag_select" }],
  },
  {
    id: "dnd", label: "Do Not Contact",
    fields: [
      { id: "smsOptedOut", label: "SMS Opted Out", type: "boolean" },
      { id: "emailOptedOut", label: "Email Opted Out", type: "boolean" },
      { id: "voiceOptedOut", label: "Voice Opted Out", type: "boolean" },
    ],
  },
  {
    id: "assignment", label: "Assignment",
    fields: [
      { id: "is_assigned", label: "Is Assigned", type: "boolean" },
      { id: "assignedUserId", label: "Assigned Agent", type: "user_select" },
    ],
  },
  {
    id: "pipeline", label: "Pipeline",
    fields: [
      { id: "in_pipeline", label: "In Pipeline", type: "pipeline_select" },
      { id: "in_stage", label: "In Stage", type: "stage_select" },
    ],
  },
  {
    id: "appointment", label: "Appointments",
    fields: [
      { id: "has_appointment", label: "Has Appointment", type: "boolean" },
      { id: "appointment_status", label: "Appointment Status", type: "select",
        options: ["scheduled", "completed", "cancelled", "no_show"] },
    ],
  },
  {
    id: "date_time", label: "Date & Time",
    fields: [
      { id: "current_day_of_week", label: "Day of Week", type: "select",
        options: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] },
      { id: "current_hour", label: "Current Hour (0-23)", type: "number" },
    ],
  },
  {
    id: "task", label: "Tasks",
    fields: [
      { id: "has_open_tasks", label: "Has Open Tasks", type: "boolean" },
    ],
  },
];

const OPERATORS_BY_TYPE: Record<string, { id: string; label: string }[]> = {
  string: [
    { id: "is", label: "Is" },
    { id: "is_not", label: "Is not" },
    { id: "contains", label: "Contains" },
    { id: "does_not_contain", label: "Does not contain" },
    { id: "starts_with", label: "Starts with" },
    { id: "ends_with", label: "Ends with" },
    { id: "is_empty", label: "Is empty" },
    { id: "is_not_empty", label: "Is not empty" },
  ],
  boolean: [
    { id: "is_true", label: "Is true" },
    { id: "is_false", label: "Is false" },
  ],
  tag_select: [
    { id: "includes", label: "Has tag" },
    { id: "does_not_include", label: "Does not have tag" },
  ],
  user_select: [
    { id: "is", label: "Is" },
    { id: "is_not", label: "Is not" },
    { id: "is_empty", label: "Is not assigned" },
    { id: "is_not_empty", label: "Is assigned" },
  ],
  pipeline_select: [
    { id: "includes", label: "Is in" },
    { id: "does_not_include", label: "Is not in" },
  ],
  stage_select: [
    { id: "includes", label: "Is in" },
    { id: "does_not_include", label: "Is not in" },
  ],
  select: [
    { id: "is", label: "Is" },
    { id: "is_not", label: "Is not" },
  ],
  number: [
    { id: "equals", label: "Equals" },
    { id: "not_equals", label: "Not equals" },
    { id: "greater_than", label: "Greater than" },
    { id: "less_than", label: "Less than" },
  ],
};

function needsValue(operator: string): boolean {
  return !["is_empty", "is_not_empty", "is_true", "is_false"].includes(operator);
}

// ---------------------------------------------------------------------------
// Condition interface (matches engine)
// ---------------------------------------------------------------------------
export interface ConditionItem {
  id: string;
  field: string;
  fieldCategory: string;
  operator: string;
  value?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface Props {
  conditions: ConditionItem[];
  conditionLogic: "and" | "or";
  organizationId: Id<"organizations">;
  onConditionsChange: (conditions: ConditionItem[]) => void;
  onLogicChange: (logic: "and" | "or") => void;
}

export function WorkflowConditionEditor({
  conditions,
  conditionLogic,
  organizationId,
  onConditionsChange,
  onLogicChange,
}: Props) {
  // Fetch data for dynamic selectors
  const tags = useQuery(api.contactTags.getByOrganization, { organizationId });
  const users = useQuery(api.users.getByOrganization, { organizationId });
  const pipelines = useQuery(api.pipelines.getByOrganization, { organizationId });

  // Track which pipeline is selected per condition (for stage selection)
  const [selectedPipelinePerCondition, setSelectedPipelinePerCondition] = useState<Record<string, string>>({});

  const stages = useQuery(
    api.pipelineStages.getByPipeline,
    Object.values(selectedPipelinePerCondition)[0]
      ? { pipelineId: Object.values(selectedPipelinePerCondition)[0] as Id<"pipelines"> }
      : "skip"
  );

  const addCondition = () => {
    const id = Math.random().toString(36).slice(2, 10);
    onConditionsChange([
      ...conditions,
      { id, field: "firstName", fieldCategory: "contact_info", operator: "is", value: "" },
    ]);
  };

  const removeCondition = (id: string) => {
    onConditionsChange(conditions.filter((c) => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<ConditionItem>) => {
    onConditionsChange(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const getFieldDef = (fieldCategory: string, field: string): FieldDef | undefined => {
    const cat = CONDITION_FIELD_CATEGORIES.find((c) => c.id === fieldCategory);
    return cat?.fields.find((f) => f.id === field);
  };

  return (
    <div className="space-y-4">
      {/* AND/OR toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Conditions</span>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => onLogicChange("and")}
            className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
              conditionLogic === "and"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            AND
          </button>
          <button
            type="button"
            onClick={() => onLogicChange("or")}
            className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
              conditionLogic === "or"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            OR
          </button>
        </div>
      </div>

      {/* Conditions list */}
      {conditions.map((condition, idx) => {
        const fieldDef = getFieldDef(condition.fieldCategory, condition.field);
        const fieldType = fieldDef?.type || "string";
        const operators = OPERATORS_BY_TYPE[fieldType] || OPERATORS_BY_TYPE.string;
        const showValue = needsValue(condition.operator);

        return (
          <div key={condition.id}>
            {/* Logic separator */}
            {idx > 0 && (
              <div className="flex items-center justify-center py-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {conditionLogic}
                </span>
              </div>
            )}

            <div className="rounded-lg border bg-card p-3 space-y-2">
              {/* Category */}
              <Select
                value={condition.fieldCategory}
                onValueChange={(cat) => {
                  const firstField = CONDITION_FIELD_CATEGORIES.find((c) => c.id === cat)?.fields[0];
                  updateCondition(condition.id, {
                    fieldCategory: cat,
                    field: firstField?.id || "",
                    operator: OPERATORS_BY_TYPE[firstField?.type || "string"]?.[0]?.id || "is",
                    value: "",
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELD_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Field */}
              <Select
                value={condition.field}
                onValueChange={(field) => {
                  const fd = getFieldDef(condition.fieldCategory, field);
                  updateCondition(condition.id, {
                    field,
                    operator: OPERATORS_BY_TYPE[fd?.type || "string"]?.[0]?.id || "is",
                    value: "",
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELD_CATEGORIES.find((c) => c.id === condition.fieldCategory)?.fields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Operator + Delete */}
              <div className="flex gap-2 items-center">
                <Select
                  value={condition.operator}
                  onValueChange={(op) => updateCondition(condition.id, { operator: op })}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => (
                      <SelectItem key={op.id} value={op.id}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  onClick={() => removeCondition(condition.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Value (own row) */}
              {showValue && (
                <div>
                  {fieldType === "tag_select" ? (
                    <Select
                      value={condition.value || ""}
                      onValueChange={(val) => updateCondition(condition.id, { value: val })}
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="Select tag..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(tags || []).map((tag) => (
                          <SelectItem key={tag._id} value={tag._id}>{tag.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : fieldType === "user_select" ? (
                    <Select
                      value={condition.value || ""}
                      onValueChange={(val) => updateCondition(condition.id, { value: val })}
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="Select user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(users || []).map((user) => (
                          <SelectItem key={user._id} value={user._id}>{user.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : fieldType === "pipeline_select" ? (
                    <Select
                      value={condition.value || ""}
                      onValueChange={(val) => {
                        updateCondition(condition.id, { value: val });
                        setSelectedPipelinePerCondition((p) => ({ ...p, [condition.id]: val }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="Select pipeline..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(pipelines || []).map((p) => (
                          <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : fieldType === "stage_select" ? (
                    <Select
                      value={condition.value || ""}
                      onValueChange={(val) => updateCondition(condition.id, { value: val })}
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="Select stage..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(stages || []).map((s) => (
                          <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : fieldType === "select" ? (
                    <Select
                      value={condition.value || ""}
                      onValueChange={(val) => updateCondition(condition.id, { value: val })}
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(fieldDef?.options || []).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={condition.value || ""}
                      onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                      placeholder="Value..."
                      className="h-8 text-xs"
                      type={fieldType === "number" ? "number" : "text"}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Add condition button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addCondition}
        className="w-full"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Condition
      </Button>
    </div>
  );
}
