"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Eraser, Pen, Type } from "lucide-react";

interface SignaturePadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (dataUrl: string) => void;
  mode: "signature" | "initials";
  signerName?: string;
}

export function SignaturePad({
  open,
  onOpenChange,
  onSave,
  mode,
  signerName,
}: SignaturePadProps) {
  const canvasRef = useRef<SignatureCanvas | null>(null);
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [typedText, setTypedText] = useState(
    mode === "initials" && signerName
      ? signerName
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
      : signerName || ""
  );
  const [isEmpty, setIsEmpty] = useState(true);

  const canvasHeight = mode === "signature" ? 150 : 80;

  function handleClear() {
    canvasRef.current?.clear();
    setIsEmpty(true);
  }

  function handleDone() {
    if (tab === "draw") {
      if (!canvasRef.current || canvasRef.current.isEmpty()) return;
      const dataUrl = canvasRef.current.getTrimmedCanvas().toDataURL("image/png");
      onSave(dataUrl);
    } else {
      if (!typedText.trim()) return;
      // Render typed text to canvas
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = mode === "signature" ? 150 : 80;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "transparent";
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const fontSize = mode === "signature" ? 48 : 36;
      ctx.font = `${fontSize}px "Brush Script MT", "Segoe Script", "Dancing Script", cursive`;
      ctx.fillStyle = "#1a1a2e";
      ctx.textBaseline = "middle";
      ctx.fillText(typedText, 10, canvas.height / 2);

      onSave(canvas.toDataURL("image/png"));
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "signature" ? "Add Your Signature" : "Add Your Initials"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "draw" | "type")}>
          <TabsList className="w-full">
            <TabsTrigger value="draw" className="flex-1 gap-1.5">
              <Pen className="size-3.5" />
              Draw
            </TabsTrigger>
            <TabsTrigger value="type" className="flex-1 gap-1.5">
              <Type className="size-3.5" />
              Type
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draw" className="mt-3">
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-white">
              <SignatureCanvas
                ref={canvasRef}
                canvasProps={{
                  width: 420,
                  height: canvasHeight,
                  className: "w-full cursor-crosshair",
                  style: { width: "100%", height: canvasHeight },
                }}
                penColor="#1a1a2e"
                minWidth={1.5}
                maxWidth={3}
                onBegin={() => setIsEmpty(false)}
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="gap-1.5 text-xs"
              >
                <Eraser className="size-3.5" />
                Clear
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="type" className="mt-3 space-y-3">
            <Input
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={
                mode === "signature"
                  ? "Type your full name"
                  : "Type your initials"
              }
              className="text-lg"
              autoFocus
            />
            {typedText && (
              <div
                className="flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-white px-4"
                style={{ height: canvasHeight }}
              >
                <span
                  className="text-[#1a1a2e]"
                  style={{
                    fontFamily:
                      '"Brush Script MT", "Segoe Script", "Dancing Script", cursive',
                    fontSize: mode === "signature" ? 48 : 36,
                  }}
                >
                  {typedText}
                </span>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDone}
            disabled={
              tab === "draw" ? isEmpty : !typedText.trim()
            }
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
