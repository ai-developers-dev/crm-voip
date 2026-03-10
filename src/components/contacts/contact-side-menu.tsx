"use client";

import { ClipboardCheck, PenLine, CalendarDays, FileText, FolderOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type PanelType = "tasks" | "notes" | "appointments" | "policies" | "documents";

const menuItems: { type: PanelType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "tasks", label: "Tasks", icon: ClipboardCheck },
  { type: "notes", label: "Notes", icon: PenLine },
  { type: "appointments", label: "Appointments", icon: CalendarDays },
  { type: "policies", label: "Policies", icon: FileText },
  { type: "documents", label: "Documents", icon: FolderOpen },
];

interface ContactSideMenuProps {
  activePanel: PanelType | null;
  onPanelChange: (panel: PanelType) => void;
  disabled?: boolean;
}

export function ContactSideMenu({ activePanel, onPanelChange, disabled }: ContactSideMenuProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col items-center gap-1 pt-4">
        {menuItems.map(({ type, label, icon: Icon }) => (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onPanelChange(type)}
                disabled={disabled}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  activePanel === type && "bg-accent text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
