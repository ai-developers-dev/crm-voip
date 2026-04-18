"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Applies the destructive button variant to the confirm action. */
  variant?: "default" | "destructive";
  /** Optional async handler. While running, the dialog stays open and shows a
   *  disabled confirm button. Close is handled by onOpenChange on success. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Single app-wide confirmation dialog. Replaces any hand-rolled "are you sure"
 * modals so every destructive action prompts in the same way.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
}: ConfirmDialogProps) {
  const [running, setRunning] = React.useState(false);

  const handleConfirm = async (e: React.MouseEvent) => {
    // Let the async flow control open state via onOpenChange — don't let
    // Radix auto-close before onConfirm finishes.
    e.preventDefault();
    setRunning(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={running}
            className={cn(
              variant === "destructive" &&
                buttonVariants({ variant: "destructive" }),
            )}
          >
            {running ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
