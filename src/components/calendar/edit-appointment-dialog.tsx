"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/calendar/date-time-picker";
import { Trash2, Search } from "lucide-react";

interface EditAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: Id<"appointments"> | null;
  organizationId: Id<"organizations">;
}

export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointmentId,
  organizationId,
}: EditAppointmentDialogProps) {
  const appointment = useQuery(
    api.appointments.getById,
    appointmentId ? { id: appointmentId } : "skip"
  );
  const updateAppt = useMutation(api.appointments.update);
  const deleteAppt = useMutation(api.appointments.remove);

  const orgUsers = useQuery(
    api.users.getByOrganization,
    organizationId ? { organizationId } : "skip"
  );

  const contacts = useQuery(
    api.contacts.getByOrganization,
    organizationId ? { organizationId } : "skip"
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [type, setType] = useState("meeting");
  const [status, setStatus] = useState("scheduled");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [contactId, setContactId] = useState<Id<"contacts"> | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filteredContacts = contacts?.filter((c) => {
    if (!contactSearch.trim()) return false;
    const search = contactSearch.toLowerCase();
    const name = `${c.firstName} ${c.lastName || ""}`.toLowerCase();
    return name.includes(search) || (c.email?.toLowerCase().includes(search));
  }).slice(0, 6);

  useEffect(() => {
    if (appointment && open) {
      setTitle(appointment.title ?? "");
      setDescription(appointment.description ?? "");
      setStartDate(new Date(appointment.appointmentDate));
      setEndDate(appointment.endDate ? new Date(appointment.endDate) : null);
      setLocation(appointment.location ?? "");
      setType(appointment.type ?? "meeting");
      setStatus(appointment.status ?? "scheduled");
      setAssigneeId(appointment.assignedToUserId ?? "");
      setContactId(appointment.contactId ?? null);
      setContactSearch("");
      setShowContactList(false);
      setConfirmDelete(false);
    }
  }, [appointment, open]);

  // Resolve contact name from ID
  useEffect(() => {
    if (contactId && contacts) {
      const c = contacts.find((c) => c._id === contactId);
      setContactName(c ? `${c.firstName} ${c.lastName || ""}`.trim() : "");
    } else {
      setContactName("");
    }
  }, [contactId, contacts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointmentId || !title.trim() || !startDate) return;

    await updateAppt({
      id: appointmentId,
      title: title.trim(),
      description: description.trim() || undefined,
      appointmentDate: startDate.getTime(),
      endDate: endDate ? endDate.getTime() : undefined,
      location: location.trim() || undefined,
      type: type as "meeting" | "call" | "video" | "other",
      status: status as "scheduled" | "completed" | "cancelled" | "no_show",
      assignedToUserId: assigneeId ? (assigneeId as Id<"users">) : undefined,
      contactId: contactId || undefined,
    });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!appointmentId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteAppt({ id: appointmentId });
    onOpenChange(false);
  };

  if (!appointment && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center text-sm text-on-surface-variant">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Appointment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-title" className="text-xs">Subject</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-description" className="text-xs">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <DateTimePicker value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End</Label>
              <DateTimePicker value={endDate} onChange={setEndDate} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-location" className="text-xs">Location</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            {orgUsers && orgUsers.length > 0 && assigneeId && (
              <div className="space-y-1">
                <Label className="text-xs">Assigned to</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgUsers.map((u) => (
                      <SelectItem key={u._id} value={u._id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Contact link */}
          <div className="space-y-2">
            <Label className="text-on-surface-variant text-xs">Linked contact</Label>
            {contactId ? (
              <div className="flex items-center justify-between rounded-xl border px-3 py-1.5">
                <span className="text-sm">{contactName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setContactId(null);
                    setContactName("");
                    setContactSearch("");
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-on-surface-variant" />
                <Input
                  placeholder="Search contacts..."
                  value={contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    setShowContactList(true);
                  }}
                  onFocus={() => setShowContactList(true)}
                  onBlur={() => setTimeout(() => setShowContactList(false), 200)}
                  className="pl-8 h-8 text-sm"
                />
                {showContactList && filteredContacts && filteredContacts.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border bg-popover max-h-40 overflow-auto">
                    {filteredContacts.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-container-high transition-colors"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setContactId(c._id);
                          setContactName(`${c.firstName} ${c.lastName || ""}`.trim());
                          setShowContactList(false);
                          setContactSearch("");
                        }}
                      >
                        {c.firstName} {c.lastName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant={confirmDelete ? "destructive" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDelete ? "Confirm Delete" : "Delete"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!title.trim() || !startDate}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
