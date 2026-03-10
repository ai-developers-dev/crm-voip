"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { X, Plus, Search, MoreHorizontal, Trash2, Pencil, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskFormDialog } from "./task-form-dialog";

interface TasksPanelProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  onClose: () => void;
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export function TasksPanel({ contact, organizationId, userId, onClose }: TasksPanelProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);

  const tasks = useQuery(api.tasks.getByContact, { contactId: contact._id });
  const updateTask = useMutation(api.tasks.update);
  const removeTask = useMutation(api.tasks.remove);

  const filtered = tasks?.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">Tasks</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => { setEditingTask(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 px-4 pb-4">
          {filtered?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No tasks found</p>
          )}
          {filtered?.map((task) => (
            <div key={task._id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{task.title}</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditingTask(task); setDialogOpen(true); }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </DropdownMenuItem>
                    {task.status !== "completed" && (
                      <DropdownMenuItem onClick={() => updateTask({ id: task._id, status: "completed" })}>
                        <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Complete
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="text-destructive" onClick={() => removeTask({ id: task._id })}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {task.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${priorityColors[task.priority]}`}>
                  {task.priority}
                </Badge>
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColors[task.status]}`}>
                  {task.status.replace("_", " ")}
                </Badge>
                {task.dueDate && (
                  <span className="text-[10px] text-muted-foreground">
                    Due {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        contactId={contact._id}
        organizationId={organizationId}
        userId={userId}
      />
    </div>
  );
}
