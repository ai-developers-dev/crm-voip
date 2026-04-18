import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Lucide icon rendered in a muted circle above the title. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Call-to-action — typically a single Button. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent "no data yet" placeholder for lists, tables, search results, and
 * panels. Centers content vertically inside its parent — parent needs a
 * bounded height or flex-1 slot.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center py-10 px-6",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };
