import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  /** Short helper text shown below the label (before the input). */
  description?: string;
  /** Validation error — shown in destructive color after the input. */
  error?: string;
  /** The form control itself (Input / Select / Textarea / Checkbox / etc.). */
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard labeled form field. Wraps a label + control + optional
 * description + optional error message in a consistent vertical stack so
 * every form in the app looks the same. Only the control is user-supplied;
 * typography and spacing come from the design tokens.
 *
 * Use inside a `space-y-4` form container for the Enter Sale look.
 */
function FormField({
  label,
  htmlFor,
  required,
  description,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span aria-hidden className="ml-1 text-destructive">*</span>
        )}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { FormField };
