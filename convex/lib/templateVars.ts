import { Doc } from "../_generated/dataModel";

interface TemplateContext {
  contact: Doc<"contacts">;
  organization?: Doc<"organizations"> | null;
  user?: Doc<"users"> | null;
}

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function resolveTemplate(template: string, context: TemplateContext): string {
  const { contact, organization, user } = context;
  const primaryPhone = contact.phoneNumbers.find((p) => p.isPrimary) || contact.phoneNumbers[0];

  const vars: Record<string, string> = {
    firstName: contact.firstName || "",
    lastName: contact.lastName || "",
    fullName: `${contact.firstName} ${contact.lastName || ""}`.trim(),
    email: contact.email || "",
    company: contact.company || "",
    phone: primaryPhone?.number || "",
    agentName: user?.name || "",
    agencyName: organization?.name || "",
  };

  return template.replace(VARIABLE_PATTERN, (match, varName) => {
    return vars[varName] ?? match;
  });
}
