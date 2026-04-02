"use client";

import { Button } from "@/components/ui/button";
import { PenLine, Type, CalendarDays, AlignLeft } from "lucide-react";

type FieldType = "signature" | "initials" | "date" | "text";

interface FieldToolbarProps {
  onAddField: (type: FieldType) => void;
  activeType?: FieldType | null;
}

const fieldTypes: { type: FieldType; label: string; icon: React.ElementType; color: string }[] = [
  { type: "signature", label: "Signature", icon: PenLine, color: "text-blue-600" },
  { type: "initials", label: "Initials", icon: Type, color: "text-purple-600" },
  { type: "date", label: "Date", icon: CalendarDays, color: "text-green-600" },
  { type: "text", label: "Text", icon: AlignLeft, color: "text-orange-600" },
];

export function FieldToolbar({ onAddField, activeType }: FieldToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      {fieldTypes.map(({ type, label, icon: Icon, color }) => (
        <Button
          key={type}
          variant={activeType === type ? "default" : "outline"}
          size="sm"
          onClick={() => onAddField(type)}
          className="gap-1.5"
        >
          <Icon className={`h-4 w-4 ${activeType === type ? "" : color}`} />
          {label}
        </Button>
      ))}
    </div>
  );
}
