"use client";

import { useState, useEffect } from "react";
import { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { updatePhoneNumberTwilioConfig } from "@/app/(dashboard)/admin/actions";

type HttpMethod = "POST" | "GET";
type ReceiveMode = "voice" | "fax";

interface TwilioConfigFormState {
  voiceUrl: string;
  voiceMethod: HttpMethod;
  voiceFallbackUrl: string;
  voiceFallbackMethod: HttpMethod;
  statusCallbackUrl: string;
  statusCallbackMethod: HttpMethod;
  voiceCallerIdLookup: boolean;
  voiceReceiveMode: ReceiveMode;
  smsUrl: string;
  smsMethod: HttpMethod;
  smsFallbackUrl: string;
  smsFallbackMethod: HttpMethod;
}

interface PhoneNumberTwilioConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: Doc<"phoneNumbers"> | null;
}

function buildDefaults(appUrl: string): TwilioConfigFormState {
  const base = appUrl.replace(/\/$/, "");
  return {
    voiceUrl: `${base}/api/twilio/voice`,
    voiceMethod: "POST",
    voiceFallbackUrl: "",
    voiceFallbackMethod: "POST",
    statusCallbackUrl: `${base}/api/twilio/status`,
    statusCallbackMethod: "POST",
    voiceCallerIdLookup: false,
    voiceReceiveMode: "voice",
    smsUrl: `${base}/api/twilio/sms`,
    smsMethod: "POST",
    smsFallbackUrl: "",
    smsFallbackMethod: "POST",
  };
}

function mergeConfig(
  defaults: TwilioConfigFormState,
  saved: Doc<"phoneNumbers">["twilioConfig"]
): TwilioConfigFormState {
  if (!saved) return defaults;
  return {
    voiceUrl: saved.voiceUrl ?? defaults.voiceUrl,
    voiceMethod: saved.voiceMethod ?? defaults.voiceMethod,
    voiceFallbackUrl: saved.voiceFallbackUrl ?? "",
    voiceFallbackMethod: saved.voiceFallbackMethod ?? defaults.voiceFallbackMethod,
    statusCallbackUrl: saved.statusCallbackUrl ?? defaults.statusCallbackUrl,
    statusCallbackMethod: saved.statusCallbackMethod ?? defaults.statusCallbackMethod,
    voiceCallerIdLookup: saved.voiceCallerIdLookup ?? false,
    voiceReceiveMode: saved.voiceReceiveMode ?? defaults.voiceReceiveMode,
    smsUrl: saved.smsUrl ?? defaults.smsUrl,
    smsMethod: saved.smsMethod ?? defaults.smsMethod,
    smsFallbackUrl: saved.smsFallbackUrl ?? "",
    smsFallbackMethod: saved.smsFallbackMethod ?? defaults.smsFallbackMethod,
  };
}

export function PhoneNumberTwilioConfigDialog({
  open,
  onOpenChange,
  phoneNumber,
}: PhoneNumberTwilioConfigDialogProps) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const defaults = buildDefaults(appUrl);

  const [form, setForm] = useState<TwilioConfigFormState>(defaults);
  const [initial, setInitial] = useState<TwilioConfigFormState>(defaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset form whenever the dialog opens for a new number
  useEffect(() => {
    if (open && phoneNumber) {
      const merged = mergeConfig(defaults, phoneNumber.twilioConfig);
      setForm(merged);
      setInitial(merged);
      setError(null);
      setSuccess(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phoneNumber?._id]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  const handleSave = async () => {
    if (!phoneNumber || !isDirty) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await updatePhoneNumberTwilioConfig(phoneNumber._id, form);
      if (result.success) {
        setSuccess(true);
        setInitial(form);
        // Auto-close after a short delay so the success state is visible
        setTimeout(() => {
          onOpenChange(false);
        }, 800);
      } else {
        setError(result.error || "Failed to save Twilio config");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof TwilioConfigFormState>(
    key: K,
    value: TwilioConfigFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setSuccess(false);
  };

  if (!phoneNumber) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Twilio Configuration</DialogTitle>
          <DialogDescription>
            Edit the raw Twilio webhook and routing configuration for{" "}
            <span className="font-mono">{phoneNumber.phoneNumber}</span>. Changes
            are pushed to Twilio immediately.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="voice" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="messaging">Messaging</TabsTrigger>
          </TabsList>

          {/* Voice tab */}
          <TabsContent value="voice" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs">A call comes in → URL</Label>
              <div className="flex gap-2">
                <Input
                  value={form.voiceUrl}
                  onChange={(e) => update("voiceUrl", e.target.value)}
                  placeholder={defaults.voiceUrl}
                  className="font-mono text-xs"
                />
                <Select
                  value={form.voiceMethod}
                  onValueChange={(v) => update("voiceMethod", v as HttpMethod)}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Primary handler fails → URL</Label>
              <div className="flex gap-2">
                <Input
                  value={form.voiceFallbackUrl}
                  onChange={(e) => update("voiceFallbackUrl", e.target.value)}
                  placeholder="(optional fallback URL)"
                  className="font-mono text-xs"
                />
                <Select
                  value={form.voiceFallbackMethod}
                  onValueChange={(v) => update("voiceFallbackMethod", v as HttpMethod)}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Call status changes → URL</Label>
              <div className="flex gap-2">
                <Input
                  value={form.statusCallbackUrl}
                  onChange={(e) => update("statusCallbackUrl", e.target.value)}
                  placeholder={defaults.statusCallbackUrl}
                  className="font-mono text-xs"
                />
                <Select
                  value={form.statusCallbackMethod}
                  onValueChange={(v) => update("statusCallbackMethod", v as HttpMethod)}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Caller Name Lookup (CNAM)</Label>
                <p className="text-xs text-muted-foreground">
                  Adds ~$0.0075 per incoming call. Looks up the caller's name.
                </p>
              </div>
              <Switch
                checked={form.voiceCallerIdLookup}
                onCheckedChange={(v) => update("voiceCallerIdLookup", v)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Receive Mode</Label>
              <Select
                value={form.voiceReceiveMode}
                onValueChange={(v) => update("voiceReceiveMode", v as ReceiveMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voice">Voice</SelectItem>
                  <SelectItem value="fax">Fax</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* Messaging tab */}
          <TabsContent value="messaging" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs">A message comes in → URL</Label>
              <div className="flex gap-2">
                <Input
                  value={form.smsUrl}
                  onChange={(e) => update("smsUrl", e.target.value)}
                  placeholder={defaults.smsUrl}
                  className="font-mono text-xs"
                />
                <Select
                  value={form.smsMethod}
                  onValueChange={(v) => update("smsMethod", v as HttpMethod)}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Primary handler fails → URL</Label>
              <div className="flex gap-2">
                <Input
                  value={form.smsFallbackUrl}
                  onChange={(e) => update("smsFallbackUrl", e.target.value)}
                  placeholder="(optional fallback URL)"
                  className="font-mono text-xs"
                />
                <Select
                  value={form.smsFallbackMethod}
                  onValueChange={(v) => update("smsFallbackMethod", v as HttpMethod)}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Twilio configuration saved.</span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save to Twilio"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
