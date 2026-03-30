"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Plus, Trash2, GripVertical } from "lucide-react";

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
];

type StageEntry = {
  id: string;
  name: string;
  color: string;
};

type PipelineBuilderProps = {
  organizationId: Id<"organizations">;
  pipeline?: Doc<"pipelines"> | null;
  onClose: () => void;
  onSaved: () => void;
};

export function PipelineBuilder({ organizationId, pipeline, onClose, onSaved }: PipelineBuilderProps) {
  const [name, setName] = useState(pipeline?.name || "");
  const [description, setDescription] = useState(pipeline?.description || "");
  const [color, setColor] = useState(pipeline?.color || PRESET_COLORS[0]);
  const [stages, setStages] = useState<StageEntry[]>(
    pipeline
      ? [] // Editing existing pipeline doesn't pre-populate stages here
      : [
          { id: "s1", name: "New", color: "#3b82f6" },
          { id: "s2", name: "Contacted", color: "#06b6d4" },
          { id: "s3", name: "Qualified", color: "#f59e0b" },
          { id: "s4", name: "Won", color: "#10b981" },
        ]
  );
  const [saving, setSaving] = useState(false);

  const createPipeline = useMutation(api.pipelines.create);
  const updatePipeline = useMutation(api.pipelines.update);

  const addStage = () => {
    if (stages.length >= 10) return;
    setStages([
      ...stages,
      { id: `s${Date.now()}`, name: "", color: PRESET_COLORS[stages.length % PRESET_COLORS.length] },
    ]);
  };

  const removeStage = (id: string) => {
    setStages(stages.filter((s) => s.id !== id));
  };

  const updateStage = (id: string, field: keyof StageEntry, value: string) => {
    setStages(stages.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!pipeline && stages.filter((s) => s.name.trim()).length === 0) return;
    setSaving(true);
    try {
      if (pipeline) {
        await updatePipeline({
          id: pipeline._id,
          name: name.trim(),
          description: description.trim() || undefined,
          color,
        });
      } else {
        await createPipeline({
          organizationId,
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          stages: stages
            .filter((s) => s.name.trim())
            .map((s) => ({ name: s.name.trim(), color: s.color })),
        });
      }
      onSaved();
    } catch (err) {
      console.error("Failed to save pipeline:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="w-full max-w-md bg-background border-l neu-ambient flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold">
            {pipeline ? "Edit Pipeline" : "New Pipeline"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="pipeline-name">Name</Label>
            <Input
              id="pipeline-name"
              placeholder="e.g. Sales Pipeline"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="pipeline-desc">Description (optional)</Label>
            <Textarea
              id="pipeline-desc"
              placeholder="What is this pipeline for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`h-7 w-7 rounded-full transition-all ${
                    color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Stages */}
          {!pipeline && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Stages</Label>
                <span className="text-xs text-on-surface-variant">{stages.length}/10 stages</span>
              </div>

              <div className="space-y-2">
                {stages.map((stage, idx) => (
                  <div key={stage.id} className="flex items-center gap-2">
                    <span className="text-xs text-on-surface-variant w-4 text-right shrink-0">{idx + 1}</span>
                    <div className="flex items-center gap-1.5">
                      {PRESET_COLORS.slice(0, 4).map((c) => (
                        <button
                          key={c}
                          className={`h-4 w-4 rounded-full transition-all ${
                            stage.color === c ? "ring-1 ring-offset-1 ring-primary" : ""
                          }`}
                          style={{ backgroundColor: c }}
                          onClick={() => updateStage(stage.id, "color", c)}
                        />
                      ))}
                    </div>
                    <Input
                      placeholder={`Stage ${idx + 1} name`}
                      value={stage.name}
                      onChange={(e) => updateStage(stage.id, "name", e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-on-surface-variant hover:text-destructive"
                      onClick={() => removeStage(stage.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={addStage}
                disabled={stages.length >= 10}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-1.5" />Add Stage
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : pipeline ? "Update" : "Create Pipeline"}
          </Button>
        </div>
      </div>
    </div>
  );
}
