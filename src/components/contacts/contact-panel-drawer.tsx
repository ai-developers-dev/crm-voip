"use client";

import { Doc } from "../../../convex/_generated/dataModel";
import { type PanelType } from "./contact-side-menu";
import { TasksPanel } from "./panels/tasks-panel";
import { NotesPanel } from "./panels/notes-panel";
import { AppointmentsPanel } from "./panels/appointments-panel";
import { PoliciesPanel } from "./panels/policies-panel";
import { DocumentsPanel } from "./panels/documents-panel";
import { Id } from "../../../convex/_generated/dataModel";

interface ContactPanelDrawerProps {
  type: PanelType;
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  isAdmin?: boolean;
  onClose: () => void;
}

export function ContactPanelDrawer({ type, contact, organizationId, userId, isAdmin, onClose }: ContactPanelDrawerProps) {
  switch (type) {
    case "tasks":
      return <TasksPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} />;
    case "notes":
      return <NotesPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} />;
    case "appointments":
      return <AppointmentsPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} />;
    case "policies":
      return <PoliciesPanel contact={contact} organizationId={organizationId} userId={userId} isAdmin={isAdmin} onClose={onClose} />;
    case "documents":
      return <DocumentsPanel contact={contact} organizationId={organizationId} userId={userId} onClose={onClose} />;
  }
}
