"use client";

import { useState, useRef, useCallback } from "react";
import { PenLine, Type, CalendarDays, AlignLeft, X, GripVertical } from "lucide-react";

export interface Field {
  id: string;
  type: "signature" | "initials" | "date" | "text";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  required: boolean;
}

interface FieldPlacerProps {
  fields: Field[];
  onFieldsChange: (fields: Field[]) => void;
  pageWidth: number;
  pageHeight: number;
  currentPage: number;
  placingType?: "signature" | "initials" | "date" | "text" | null;
  onPlaced?: () => void;
}

const typeConfig: Record<
  Field["type"],
  { icon: React.ElementType; color: string; bg: string; border: string; label: string }
> = {
  signature: {
    icon: PenLine,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-300",
    label: "Signature",
  },
  initials: {
    icon: Type,
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-300",
    label: "Initials",
  },
  date: {
    icon: CalendarDays,
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-300",
    label: "Date",
  },
  text: {
    icon: AlignLeft,
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-300",
    label: "Text",
  },
};

const defaultSizes: Record<Field["type"], { width: number; height: number }> = {
  signature: { width: 20, height: 6 },
  initials: { width: 10, height: 6 },
  date: { width: 15, height: 5 },
  text: { width: 20, height: 5 },
};

export function FieldPlacer({
  fields,
  onFieldsChange,
  pageWidth,
  pageHeight,
  currentPage,
  placingType,
  onPlaced,
}: FieldPlacerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const interactingRef = useRef(false); // true when dragging/resizing a field
  const [dragging, setDragging] = useState<{
    fieldId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    fieldId: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const pageFields = fields.filter((f) => f.page === currentPage);

  // Place a new field on click (only on the empty overlay, not on existing fields)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Don't place if we were dragging/resizing or clicking an existing field
      if (!placingType || !overlayRef.current || interactingRef.current) return;
      // Only place if the click target is the overlay itself, not a child field
      if (e.target !== overlayRef.current) return;

      const rect = overlayRef.current.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;

      const size = defaultSizes[placingType];
      const newField: Field = {
        id: crypto.randomUUID(),
        type: placingType,
        page: currentPage,
        x: Math.max(0, Math.min(xPct - size.width / 2, 100 - size.width)),
        y: Math.max(0, Math.min(yPct - size.height / 2, 100 - size.height)),
        width: size.width,
        height: size.height,
        label: typeConfig[placingType].label,
        required: true,
      };

      onFieldsChange([...fields, newField]);
      onPlaced?.();
    },
    [placingType, currentPage, fields, onFieldsChange, onPlaced]
  );

  // Drag handling
  const handleDragStart = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      e.stopPropagation();
      e.preventDefault();
      if (!overlayRef.current) return;
      interactingRef.current = true;

      const rect = overlayRef.current.getBoundingClientRect();
      const field = fields.find((f) => f.id === fieldId);
      if (!field) return;

      const fieldXPx = (field.x / 100) * rect.width;
      const fieldYPx = (field.y / 100) * rect.height;

      setDragging({
        fieldId,
        offsetX: e.clientX - rect.left - fieldXPx,
        offsetY: e.clientY - rect.top - fieldYPx,
      });
    },
    [fields]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();

      if (dragging) {
        const xPx = e.clientX - rect.left - dragging.offsetX;
        const yPx = e.clientY - rect.top - dragging.offsetY;
        const xPct = (xPx / rect.width) * 100;
        const yPct = (yPx / rect.height) * 100;

        const field = fields.find((f) => f.id === dragging.fieldId);
        if (!field) return;

        const clampedX = Math.max(0, Math.min(xPct, 100 - field.width));
        const clampedY = Math.max(0, Math.min(yPct, 100 - field.height));

        onFieldsChange(
          fields.map((f) =>
            f.id === dragging.fieldId ? { ...f, x: clampedX, y: clampedY } : f
          )
        );
      }

      if (resizing) {
        const deltaX = ((e.clientX - resizing.startX) / rect.width) * 100;
        const deltaY = ((e.clientY - resizing.startY) / rect.height) * 100;

        const newWidth = Math.max(8, resizing.startWidth + deltaX);
        const newHeight = Math.max(4, resizing.startHeight + deltaY);

        onFieldsChange(
          fields.map((f) =>
            f.id === resizing.fieldId
              ? {
                  ...f,
                  width: Math.min(newWidth, 100 - f.x),
                  height: Math.min(newHeight, 100 - f.y),
                }
              : f
          )
        );
      }
    },
    [dragging, resizing, fields, onFieldsChange]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
    // Delay clearing the flag so the click event (which fires after mouseup) still sees it
    setTimeout(() => { interactingRef.current = false; }, 0);
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      e.stopPropagation();
      e.preventDefault();
      interactingRef.current = true;
      const field = fields.find((f) => f.id === fieldId);
      if (!field) return;

      setResizing({
        fieldId,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: field.width,
        startHeight: field.height,
      });
    },
    [fields]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      e.stopPropagation();
      onFieldsChange(fields.filter((f) => f.id !== fieldId));
    },
    [fields, onFieldsChange]
  );

  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 ${placingType ? "cursor-crosshair" : ""}`}
      onClick={handleOverlayClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {pageFields.map((field) => {
        const config = typeConfig[field.type];
        const Icon = config.icon;

        return (
          <div
            key={field.id}
            className={`absolute border-2 ${config.border} ${config.bg} rounded-md flex items-center gap-1.5 px-2 select-none group`}
            style={{
              left: `${field.x}%`,
              top: `${field.y}%`,
              width: `${field.width}%`,
              height: `${field.height}%`,
              minHeight: "24px",
            }}
            onMouseDown={(e) => handleDragStart(e, field.id)}
          >
            {/* Drag handle */}
            <GripVertical className={`h-3 w-3 ${config.color} opacity-50 cursor-grab flex-shrink-0`} />

            {/* Icon */}
            <Icon className={`h-3.5 w-3.5 ${config.color} flex-shrink-0`} />

            {/* Label */}
            <span className={`text-[10px] font-semibold ${config.color} truncate`}>
              {field.label || config.label}
            </span>

            {/* Delete button */}
            <button
              className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => handleDelete(e, field.id)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <X className="h-2.5 w-2.5" />
            </button>

            {/* Resize handle */}
            <div
              className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
              onMouseDown={(e) => handleResizeStart(e, field.id)}
            >
              <svg viewBox="0 0 12 12" className={`w-3 h-3 ${config.color}`}>
                <path d="M11 1v10H1" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
