"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 rounded-lg border bg-card p-8">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-extrabold tracking-tight">This page hit an error</h2>
          <p className="text-sm text-muted-foreground">
            Try refreshing the page. If the problem persists, navigate to another section.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/70 font-mono pt-2">
              {error.digest}
            </p>
          )}
        </div>
        <Button onClick={reset} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    </div>
  );
}
