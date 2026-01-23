"use client";

import { Settings2 } from "lucide-react";

export function ContactDetailsPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center p-6">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Settings2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium text-muted-foreground">
        Additional Features
      </h3>
      <p className="text-xs text-muted-foreground mt-2 max-w-[180px]">
        Quick actions, notes, and activity timeline coming soon.
      </p>
    </div>
  );
}
