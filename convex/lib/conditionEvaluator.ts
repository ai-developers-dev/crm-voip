import { Doc } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Condition {
  id: string;
  field: string;
  fieldCategory: string;
  operator: string;
  value?: string;
}

export interface EvaluationContext {
  tasks?: { status: string; priority: string }[];
  appointments?: { status: string; contactId?: string }[];
  pipelineContacts?: { pipelineId: string; stageId: string }[];
  now?: Date;
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------
export function evaluateConditions(
  conditions: Condition[],
  logic: "and" | "or",
  contact: Doc<"contacts">,
  context: EvaluationContext
): boolean {
  if (conditions.length === 0) return true; // No conditions = always true

  const results = conditions.map((c) => evaluateSingleCondition(c, contact, context));

  if (logic === "or") return results.some(Boolean);
  return results.every(Boolean); // "and" is default
}

// ---------------------------------------------------------------------------
// Single condition evaluation
// ---------------------------------------------------------------------------
function evaluateSingleCondition(
  condition: Condition,
  contact: Doc<"contacts">,
  context: EvaluationContext
): boolean {
  const { field, fieldCategory, operator, value } = condition;
  const fieldValue = getFieldValue(field, fieldCategory, contact, context);
  return evaluateOperator(fieldValue, operator, value);
}

// ---------------------------------------------------------------------------
// Field value resolution
// ---------------------------------------------------------------------------
function getFieldValue(
  field: string,
  category: string,
  contact: Doc<"contacts">,
  context: EvaluationContext
): unknown {
  const now = context.now || new Date();

  switch (category) {
    case "contact_info": {
      const contactRecord = contact as Record<string, unknown>;
      return contactRecord[field] ?? "";
    }

    case "tags":
      // "has_tag" — return the tags array for includes/does_not_include operators
      if (field === "has_tag") return contact.tags || [];
      return [];

    case "dnd":
      if (field === "smsOptedOut") return contact.smsOptedOut ?? false;
      if (field === "emailOptedOut") return contact.emailOptedOut ?? false;
      if (field === "voiceOptedOut") return contact.voiceOptedOut ?? false;
      return false;

    case "assignment":
      if (field === "is_assigned") return !!contact.assignedUserId;
      if (field === "assignedUserId") return contact.assignedUserId || "";
      return "";

    case "pipeline": {
      const pcs = context.pipelineContacts || [];
      if (field === "in_pipeline") {
        // If value is provided, check specific pipeline; otherwise check if in any pipeline
        return pcs.length > 0 ? pcs.map((pc) => pc.pipelineId) : [];
      }
      if (field === "in_stage") {
        return pcs.length > 0 ? pcs.map((pc) => pc.stageId) : [];
      }
      return [];
    }

    case "appointment": {
      const appts = context.appointments || [];
      if (field === "has_appointment") return appts.length > 0;
      if (field === "appointment_status") {
        return appts.map((a) => a.status);
      }
      return "";
    }

    case "date_time": {
      if (field === "current_day_of_week") {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return days[now.getDay()];
      }
      if (field === "current_hour") return now.getHours();
      if (field === "contact_created_days_ago") {
        return Math.floor((now.getTime() - contact.createdAt) / 86400000);
      }
      return "";
    }

    case "task": {
      const tasks = context.tasks || [];
      if (field === "has_open_tasks") {
        return tasks.some((t) => t.status === "todo" || t.status === "in_progress");
      }
      return false;
    }

    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Operator evaluation
// ---------------------------------------------------------------------------
function evaluateOperator(
  fieldValue: unknown,
  operator: string,
  compareValue?: string
): boolean {
  switch (operator) {
    // --- String operators ---
    case "is":
      return String(fieldValue).toLowerCase() === (compareValue || "").toLowerCase();

    case "is_not":
      return String(fieldValue).toLowerCase() !== (compareValue || "").toLowerCase();

    case "contains":
      return String(fieldValue).toLowerCase().includes((compareValue || "").toLowerCase());

    case "does_not_contain":
      return !String(fieldValue).toLowerCase().includes((compareValue || "").toLowerCase());

    case "starts_with":
      return String(fieldValue).toLowerCase().startsWith((compareValue || "").toLowerCase());

    case "ends_with":
      return String(fieldValue).toLowerCase().endsWith((compareValue || "").toLowerCase());

    case "is_empty":
      if (Array.isArray(fieldValue)) return fieldValue.length === 0;
      return !fieldValue || fieldValue === "";

    case "is_not_empty":
      if (Array.isArray(fieldValue)) return fieldValue.length > 0;
      return !!fieldValue && fieldValue !== "";

    // --- Boolean operators ---
    case "is_true":
      return fieldValue === true;

    case "is_false":
      return fieldValue === false || !fieldValue;

    // --- Numeric operators ---
    case "equals":
      return Number(fieldValue) === Number(compareValue);

    case "not_equals":
      return Number(fieldValue) !== Number(compareValue);

    case "greater_than":
      return Number(fieldValue) > Number(compareValue);

    case "less_than":
      return Number(fieldValue) < Number(compareValue);

    // --- Array/tag operators ---
    case "includes":
      if (Array.isArray(fieldValue)) return fieldValue.includes(compareValue);
      return String(fieldValue) === compareValue;

    case "does_not_include":
      if (Array.isArray(fieldValue)) return !fieldValue.includes(compareValue);
      return String(fieldValue) !== compareValue;

    // --- Date operators ---
    case "is_before":
      return new Date(String(fieldValue)).getTime() < new Date(compareValue || "").getTime();

    case "is_after":
      return new Date(String(fieldValue)).getTime() > new Date(compareValue || "").getTime();

    default:
      return false;
  }
}
