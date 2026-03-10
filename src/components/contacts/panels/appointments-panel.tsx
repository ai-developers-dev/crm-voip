"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { X, Plus, Search, MoreHorizontal, Trash2, Pencil } from "lucide-react";
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
import { AppointmentFormDialog } from "./appointment-form-dialog";

interface AppointmentsPanelProps {
  contact: Doc<"contacts">;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  meeting: "Meeting",
  call: "Call",
  video: "Video",
  other: "Other",
};

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-yellow-100 text-yellow-700",
};

export function AppointmentsPanel({ contact, organizationId, userId, onClose }: AppointmentsPanelProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Doc<"appointments"> | null>(null);

  const appointments = useQuery(api.appointments.getByContact, { contactId: contact._id });
  const removeAppt = useMutation(api.appointments.remove);

  const filtered = appointments?.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">Appointments</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => { setEditingAppt(null); setDialogOpen(true); }}>
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
            placeholder="Search appointments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 px-4 pb-4">
          {filtered?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No appointments found</p>
          )}
          {filtered?.map((appt) => (
            <div key={appt._id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium leading-tight">{appt.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(appt.appointmentDate).toLocaleDateString()} at{" "}
                    {new Date(appt.appointmentDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditingAppt(appt); setDialogOpen(true); }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => removeAppt({ id: appt._id })}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {appt.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{appt.description}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColors[appt.status]}`}>
                  {appt.status.replace("_", " ")}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {typeLabels[appt.type]}
                </Badge>
                {appt.location && (
                  <span className="text-[10px] text-muted-foreground">{appt.location}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <AppointmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editingAppt}
        contactId={contact._id}
        organizationId={organizationId}
        userId={userId}
      />
    </div>
  );
}
