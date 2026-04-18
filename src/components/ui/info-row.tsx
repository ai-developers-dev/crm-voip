import * as React from "react";
import { cn } from "@/lib/utils";

interface InfoRowProps extends React.ComponentProps<"div"> {
  label: string;
  value: React.ReactNode;
}

/**
 * Read-only label/value pair. Used inside a Card for the Agent / Insured
 * context block at the top of the Enter Sale dialog, and anywhere else we
 * display non-editable field pairs in a dialog or panel.
 */
function InfoRow({ label, value, className, ...props }: InfoRowProps) {
  return (
    <div
      data-slot="info-row"
      className={cn("flex items-center justify-between text-sm", className)}
      {...props}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export { InfoRow };
