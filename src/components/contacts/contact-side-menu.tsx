"use client";

import { ClipboardCheck, PenLine, CalendarDays, FileText, FolderOpen, ArrowUpDown, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type PanelType = "tasks" | "notes" | "appointments" | "policies" | "documents" | "quotes" | "sort";

export type SortField = "name" | "streetAddress" | "city" | "state" | "zip" | "email" | "phone" | "tag";

const menuItems: { type: PanelType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "tasks", label: "Tasks", icon: ClipboardCheck },
  { type: "notes", label: "Notes", icon: PenLine },
  { type: "appointments", label: "Appointments", icon: CalendarDays },
  { type: "policies", label: "Policies", icon: FileText },
  { type: "documents", label: "Documents", icon: FolderOpen },
  { type: "quotes", label: "Quote", icon: Calculator },
];

interface ContactSideMenuProps {
  activePanel: PanelType | null;
  onPanelChange: (panel: PanelType) => void;
}

export function ContactSideMenu({ activePanel, onPanelChange }: ContactSideMenuProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col items-center gap-1 pt-4">
        {menuItems.map(({ type, label, icon: Icon }) => (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onPanelChange(type)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
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

        {/* Divider */}
        <div className="w-6 my-1" />

        {/* Sort button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onPanelChange("sort")}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                activePanel === "sort" && "bg-accent text-accent-foreground"
              )}
            >
              <ArrowUpDown className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Sort</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
