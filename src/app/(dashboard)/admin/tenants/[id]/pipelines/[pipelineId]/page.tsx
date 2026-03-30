"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, ArrowLeft, Plus, GripVertical, Phone, MessageSquare, Users,
  Calendar, BarChart3, Bot, Workflow, Settings, Columns3, Search, X, ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PipelineContact = {
  _id: Id<"pipelineContacts">;
  stageId: Id<"pipelineStages">;
  contactId: Id<"contacts">;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactTags: { id: Id<"contactTags">; name: string; color: string }[];
};

// ---------------------------------------------------------------------------
// Draggable Contact Card
// ---------------------------------------------------------------------------
function ContactCard({ pc, isDragOverlay }: { pc: PipelineContact; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `contact-${pc._id}`,
    data: { type: "pipeline-contact", pipelineContact: pc },
  });

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      className={`flex items-start gap-2 rounded-xl border bg-surface p-3 text-sm transition-shadow
        ${isDragging ? "opacity-30" : ""}
        ${isDragOverlay ? "neu-ambient ring-2 ring-primary/20" : ""}`}
    >
      <button
        className="mt-0.5 cursor-grab text-on-surface-variant hover:text-on-surface shrink-0"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{pc.contactName}</p>
        {pc.contactPhone && (
          <p className="text-xs text-on-surface-variant truncate">{pc.contactPhone}</p>
        )}
        {pc.contactTags.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {pc.contactTags.slice(0, 3).map((tag) => (
              <div
                key={tag.id}
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
                title={tag.name}
              />
            ))}
            {pc.contactTags.length > 3 && (
              <span className="text-[10px] text-on-surface-variant">+{pc.contactTags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Droppable Stage Column
// ---------------------------------------------------------------------------
function StageColumn({
  stage,
  contacts,
  onRemove,
}: {
  stage: { _id: Id<"pipelineStages">; name: string; color?: string };
  contacts: PipelineContact[];
  onRemove: (id: Id<"pipelineContacts">) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage._id}`,
    data: { type: "pipeline-stage", stageId: stage._id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 shrink-0 rounded-2xl border bg-surface-container/30 transition-colors
        ${isOver ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}
    >
      {/* Color bar */}
      <div
        className="h-1.5 rounded-t-lg"
        style={{ backgroundColor: stage.color || "#94a3b8" }}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-semibold truncate">{stage.name}</span>
        <Badge variant="secondary" className="text-xs tabular-nums">{contacts.length}</Badge>
      </div>
      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {contacts.map((pc) => (
          <div key={pc._id} className="group relative">
            <ContactCard pc={pc} />
            <button
              onClick={() => onRemove(pc._id)}
              className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-destructive transition-all"
              title="Remove from pipeline"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {contacts.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-on-surface-variant">
            Drop contacts here
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Contact Dialog
// ---------------------------------------------------------------------------
function AddContactDialog({
  open,
  onOpenChange,
  organizationId,
  pipelineId,
  firstStageId,
  existingContactIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  pipelineId: Id<"pipelines">;
  firstStageId: Id<"pipelineStages"> | undefined;
  existingContactIds: Set<string>;
}) {
  const [search, setSearch] = useState("");

  const contacts = useQuery(
    api.contacts.getByOrganization,
    organizationId ? { organizationId } : "skip"
  );

  const addToPipeline = useMutation(api.pipelineContacts.addToPipeline);

  const filtered = useMemo(() => {
    if (!contacts) return [];
    const q = search.toLowerCase();
    return contacts.filter((c) => {
      if (existingContactIds.has(c._id)) return false;
      if (!q) return true;
      const name = `${c.firstName} ${c.lastName || ""}`.toLowerCase();
      const phone = c.phoneNumbers?.map((p) => p.number).join(" ") || "";
      return name.includes(q) || phone.includes(q) || (c.email || "").toLowerCase().includes(q);
    });
  }, [contacts, search, existingContactIds]);

  const handleAdd = async (contactId: Id<"contacts">) => {
    if (!firstStageId) return;
    try {
      await addToPipeline({
        organizationId,
        pipelineId,
        stageId: firstStageId,
        contactId,
      });
    } catch {
      // Already in pipeline
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contact to Pipeline</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-6">
              {contacts === undefined ? "Loading..." : "No contacts found"}
            </p>
          )}
          {filtered.slice(0, 50).map((c) => {
            const primaryPhone = c.phoneNumbers?.find((p) => p.isPrimary) || c.phoneNumbers?.[0];
            return (
              <button
                key={c._id}
                onClick={() => handleAdd(c._id)}
                className="flex items-center justify-between w-full rounded-xl px-3 py-2 text-sm hover:bg-surface-container-high transition-colors text-left"
              >
                <div className="min-w-0">
                  <span className="font-medium">{c.firstName} {c.lastName || ""}</span>
                  {primaryPhone && (
                    <span className="ml-2 text-xs text-on-surface-variant">{primaryPhone.number}</span>
                  )}
                </div>
                <Plus className="h-4 w-4 text-on-surface-variant shrink-0" />
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function PipelineKanbanPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;
  const pipelineId = params.pipelineId as string;

  const [activeCard, setActiveCard] = useState<PipelineContact | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  const pipeline = useQuery(
    api.pipelines.getById,
    pipelineId ? { id: pipelineId as Id<"pipelines"> } : "skip"
  );

  const stages = useQuery(
    api.pipelineStages.getByPipeline,
    pipelineId ? { pipelineId: pipelineId as Id<"pipelines"> } : "skip"
  );

  const pipelineContacts = useQuery(
    api.pipelineContacts.getByPipeline,
    pipelineId ? { pipelineId: pipelineId as Id<"pipelines"> } : "skip"
  );

  const moveToStage = useMutation(api.pipelineContacts.moveToStage);
  const removeFromPipeline = useMutation(api.pipelineContacts.removeFromPipeline);

  // Group contacts by stage
  const contactsByStage = useMemo(() => {
    const map = new Map<string, PipelineContact[]>();
    if (!stages) return map;
    for (const stage of stages) map.set(stage._id, []);
    if (pipelineContacts) {
      for (const pc of pipelineContacts) {
        const list = map.get(pc.stageId) || [];
        list.push(pc as PipelineContact);
        map.set(pc.stageId, list);
      }
    }
    return map;
  }, [stages, pipelineContacts]);

  const existingContactIds = useMemo(() => {
    const set = new Set<string>();
    if (pipelineContacts) {
      for (const pc of pipelineContacts) set.add(pc.contactId);
    }
    return set;
  }, [pipelineContacts]);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "pipeline-contact") {
      setActiveCard(data.pipelineContact as PipelineContact);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (activeData?.type !== "pipeline-contact" || overData?.type !== "pipeline-stage") return;

    const pc = activeData.pipelineContact as PipelineContact;
    const toStageId = overData.stageId as Id<"pipelineStages">;

    if (pc.stageId === toStageId) return;

    moveToStage({
      id: pc._id,
      organizationId: tenant!._id,
      toStageId,
    });
  };

  const handleRemove = (id: Id<"pipelineContacts">) => {
    if (confirm("Remove this contact from the pipeline?")) {
      removeFromPipeline({ id });
    }
  };

  if (!tenant || !pipeline) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" /><span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--header-height, 3.5rem))" }}>
      {/* Tenant header with inline nav */}
      <div className="shrink-0 bg-surface px-6 py-3">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}><Button variant="ghost" size="sm" className="gap-2"><Phone className="h-4 w-4" />Calls</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}><Button variant="ghost" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />SMS</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}><Button variant="ghost" size="sm" className="gap-2"><Users className="h-4 w-4" />Contacts</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}><Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/tasks`}><Button variant="ghost" size="sm" className="gap-2"><ClipboardCheck className="h-4 w-4" />Tasks</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}><Button variant="ghost" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}><Button variant="ghost" size="sm" className="gap-2"><Workflow className="h-4 w-4" />Workflows</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/pipelines`}><Button variant="secondary" size="sm" className="gap-2"><Columns3 className="h-4 w-4" />Pipelines</Button></Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}><Button variant="ghost" size="sm" className="gap-2"><Bot className="h-4 w-4" />AI Agents</Button></Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}><Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings</Button></Link>
        </div>
      </div>

      {/* Pipeline header */}
      <div className="shrink-0 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/admin/tenants/${tenant._id}/pipelines`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {pipeline.color && (
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: pipeline.color }} />
          )}
          <h1 className="page-title">{pipeline.name}</h1>
          {pipeline.description && (
            <span className="text-sm text-on-surface-variant hidden sm:inline">
              {pipeline.description}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Add Contact
        </Button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 p-4 h-full items-start">
            {(stages ?? []).map((stage) => (
              <StageColumn
                key={stage._id}
                stage={stage}
                contacts={contactsByStage.get(stage._id) || []}
                onRemove={handleRemove}
              />
            ))}
            {stages && stages.length === 0 && (
              <div className="flex items-center justify-center w-full text-sm text-on-surface-variant py-20">
                No stages in this pipeline. Edit the pipeline to add stages.
              </div>
            )}
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="w-72">
                <ContactCard pc={activeCard} isDragOverlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {showAddDialog && (
        <AddContactDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          organizationId={tenant._id}
          pipelineId={pipelineId as Id<"pipelines">}
          firstStageId={stages?.[0]?._id}
          existingContactIds={existingContactIds}
        />
      )}
    </div>
  );
}
