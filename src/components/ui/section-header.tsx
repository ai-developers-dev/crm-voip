import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Uppercase subsection label inside dialogs / form sections, e.g. the
 * "LINES OF BUSINESS" / "EFFECTIVE DATE" dividers in the Enter Sale dialog.
 * Typography is driven by the shared `.label-text` utility so all of these
 * headers stay identical app-wide.
 */
function SectionHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="section-header"
      className={cn("label-text mb-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { SectionHeader };
