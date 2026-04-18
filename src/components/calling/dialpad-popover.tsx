"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Phone, Delete, Loader2 } from "lucide-react";
import { useOptionalCallingContext } from "./calling-provider";
import { toE164, formatAsTyped, isDialable } from "@/lib/phone";
import { cn } from "@/lib/utils";

const KEYS: Array<{ digit: string; letters?: string }> = [
  { digit: "1" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*" },
  { digit: "0", letters: "+" },
  { digit: "#" },
];

export function DialpadPopover() {
  const callingContext = useOptionalCallingContext();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [dialing, setDialing] = useState(false);

  // `isReady` is the device-registered state; without it `makeCall` errors out.
  const isReady = callingContext?.isReady ?? false;

  const appendDigit = (digit: string) => {
    setInput((prev) => prev + digit);
  };

  const backspace = () => {
    setInput((prev) => prev.slice(0, -1));
  };

  const clear = () => setInput("");

  const canDial = isDialable(input) && !dialing && isReady;

  const handleCall = async () => {
    const e164 = toE164(input);
    if (!e164 || !callingContext) return;
    setDialing(true);
    try {
      const call = await callingContext.makeCall(e164);
      if (call) {
        // Close the popover — the persistent ActiveCallBar takes over.
        setOpen(false);
        setInput("");
      }
    } catch (err) {
      console.error("Dialpad call failed:", err);
    } finally {
      setDialing(false);
    }
  };

  // Always render the trigger so the icon has a stable slot in the nav.
  // If calling isn't wired up yet (no provider, device registering, etc.) we
  // show it disabled with a helpful tooltip instead of returning null —
  // otherwise the icon seems to "disappear" during page loads or when the
  // calling context hasn't resolved yet.
  const triggerDisabled = !callingContext || !isReady;
  const triggerTitle = !callingContext
    ? "Phone system loading…"
    : isReady
    ? "Open dialpad"
    : "Phone system not ready";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={triggerDisabled}
          title={triggerTitle}
          aria-label={triggerTitle}
        >
          <Phone className="h-4 w-4" />
          Dial
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <Input
              value={formatAsTyped(input) || input}
              onChange={(e) => {
                // Allow paste / type: keep only legit dialpad chars.
                const cleaned = e.target.value.replace(/[^\d+*#]/g, "");
                setInput(cleaned);
              }}
              placeholder="Enter number"
              className="text-center text-lg font-mono tracking-wide"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && canDial) {
                  e.preventDefault();
                  handleCall();
                }
              }}
            />
            {input && !isDialable(input) && (
              <p className="text-[11px] text-on-surface-variant text-center">
                Keep typing…
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map(({ digit, letters }) => (
              <button
                key={digit}
                type="button"
                onClick={() => appendDigit(digit)}
                className={cn(
                  "flex flex-col items-center justify-center h-12 rounded-xl",
                  "bg-surface-container hover:bg-surface-container-high",
                  "transition-colors active:scale-95",
                )}
              >
                <span className="text-lg font-semibold">{digit}</span>
                {letters && (
                  <span className="text-[9px] tracking-widest text-on-surface-variant">
                    {letters}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={backspace}
              disabled={!input}
            >
              <Delete className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleCall}
              disabled={!canDial}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {dialing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Dialing…
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4 mr-2" /> Call
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={clear}
              disabled={!input}
            >
              Clear
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
