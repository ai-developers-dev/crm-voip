"use client";

import { Doc } from "../../../convex/_generated/dataModel";
import { type PanelType } from "./contact-side-menu";
import { TasksPanel } from "./panels/tasks-panel";
import { NotesPanel } from "./panels/notes-panel";
import { AppointmentsPanel } from "./panels/appointments-panel";
import { PoliciesPanel } from "./panels/policies-panel";
import { DocumentsPanel } from "./panels/documents-panel";
import { ESignPanel } from "./panels/e-sign-panel";
import { SortPanel } from "./panels/sort-panel";
import { QuotePanel } from "./panels/quote-panel";
import { Id } from "../../../convex/_generated/dataModel";

interface ContactPanelDrawerProps {
  type: PanelType;
  contact?: Doc<"contacts"> | null;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  isAdmin?: boolean;
  onClose: () => void;
  onSelectContact?: (contact: Doc<"contacts">) => void;
}

export function ContactPanelDrawer({ type, contact, organizationId, userId, isAdmin, onClose, onSelectContact }: ContactPanelDrawerProps) {
  switch (type) {
    case "tasks":
      return contact ? <TasksPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} /> : null;
    case "notes":
      return contact ? <NotesPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} /> : null;
    case "appointments":
      return contact ? <AppointmentsPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} /> : null;
    case "policies":
      return contact ? <PoliciesPanel contact={contact} organizationId={organizationId} userId={userId} isAdmin={isAdmin} onClose={onClose} /> : null;
    case "documents":
      return contact ? <DocumentsPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} /> : null;
    case "quotes":
      return contact ? <QuotePanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} /> : null;
    case "e-sign":
      return contact ? <ESignPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} /> : null;
    case "sort":
      return (
        <SortPanel
          organizationId={organizationId}
          onSelectContact={onSelectContact || (() => {})}
          onClose={onClose}
        />
      );
  }
}
