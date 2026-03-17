"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  summary: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export function SettingsRow({
  icon,
  label,
  summary,
  badge,
  action,
  isExpanded,
  onToggle,
  children,
}: SettingsRowProps) {
  return (
    <Card className="cursor-pointer" onClick={onToggle}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0">{icon}</div>
          <div className="font-semibold text-sm min-w-[90px] shrink-0">{label}</div>
          <span className="text-xs text-muted-foreground">{summary}</span>
          <div className="flex-1" />
          {badge && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{badge}</div>}
          {action && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{action}</div>}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
              isExpanded && "rotate-180"
            )}
          />
        </div>

        {children && (
          <div
            className={cn(
              "overflow-hidden transition-all duration-200 ease-in-out",
              isExpanded ? "max-h-[2000px] opacity-100 mt-3" : "max-h-0 opacity-0"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-t border-border/40 pt-3">
              {children}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
