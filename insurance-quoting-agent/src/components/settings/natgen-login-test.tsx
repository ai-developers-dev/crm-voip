"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, XCircle, ShieldCheck } from "lucide-react";

type Stage =
  | { type: "idle" }
  | { type: "loading"; message: string }
  | { type: "needs_2fa"; sessionId: string; prompt: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

interface NatGenLoginTestProps {
  organizationId: string;
  /** Pass username+password when testing unsaved credentials */
  username?: string;
  password?: string;
}

export function NatGenLoginTest({ organizationId, username, password }: NatGenLoginTestProps) {
  const [stage, setStage] = useState<Stage>({ type: "idle" });
  const [code, setCode] = useState("");

  const startTest = async () => {
    setStage({ type: "loading", message: "Launching browser and logging in to NatGen…" });
    setCode("");
    try {
      const body: Record<string, string> =
        username && password
          ? { action: "start_login", username, password }
          : { action: "start_login", organizationId };

      const res = await fetch("/api/portal-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.status === "logged_in") {
        setStage({ type: "success", message: data.message });
      } else if (data.status === "needs_2fa") {
        setStage({ type: "needs_2fa", sessionId: data.sessionId, prompt: data.message });
      } else {
        setStage({ type: "error", message: data.message ?? "Login failed" });
      }
    } catch (err: any) {
      setStage({ type: "error", message: err.message ?? "Network error" });
    }
  };

  const submit2fa = async () => {
    if (stage.type !== "needs_2fa") return;
    const { sessionId } = stage;
    setStage({ type: "loading", message: "Submitting verification code…" });
    try {
      const res = await fetch("/api/portal-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_2fa", sessionId, code }),
      });
      const data = await res.json();
      if (data.status === "logged_in") {
        setStage({ type: "success", message: data.message });
      } else {
        setStage({ type: "error", message: data.message ?? "Verification failed" });
      }
    } catch (err: any) {
      setStage({ type: "error", message: err.message ?? "Network error" });
    }
  };

  const cancel = async () => {
    if (stage.type === "needs_2fa") {
      fetch("/api/portal-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup", sessionId: stage.sessionId }),
      }).catch(() => {});
    }
    setStage({ type: "idle" });
    setCode("");
  };

  if (stage.type === "idle") {
    return (
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={startTest}>
        <ShieldCheck className="h-3 w-3 mr-1" />
        Test Login
      </Button>
    );
  }

  if (stage.type === "loading") {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        {stage.message}
      </div>
    );
  }

  if (stage.type === "needs_2fa") {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-start gap-2 text-xs text-amber-400">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap font-sans">{stage.prompt}</pre>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            placeholder="Enter verification code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) submit2fa(); }}
            className="h-8 text-sm max-w-[180px]"
            autoFocus
          />
          <Button size="sm" className="h-8 text-xs" onClick={submit2fa} disabled={!code.trim()}>
            Verify
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (stage.type === "success") {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{stage.message}</span>
        <button onClick={() => setStage({ type: "idle" })} className="text-muted-foreground hover:text-foreground ml-auto text-[10px]">
          Dismiss
        </button>
      </div>
    );
  }

  // error
  return (
    <div className="mt-2 text-xs text-destructive space-y-1">
      <div className="flex items-start gap-2">
        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <pre className="flex-1 whitespace-pre-wrap break-all font-sans">{stage.message}</pre>
        <button onClick={() => setStage({ type: "idle" })} className="text-muted-foreground hover:text-foreground text-[10px] shrink-0">
          Retry
        </button>
      </div>
    </div>
  );
}
