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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/calendar/date-time-picker";
import { Search } from "lucide-react";

interface NewAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  userId?: Id<"users">;
  defaultDate?: Date;
}

export function NewAppointmentDialog({
  open,
  onOpenChange,
  organizationId,
  userId,
  defaultDate,
}: NewAppointmentDialogProps) {
  const createAppt = useMutation(api.appointments.create);

  // Fetch org users for assignee dropdown
  const orgUsers = useQuery(
    api.users.getByOrganization,
    organizationId ? { organizationId } : "skip"
  );

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");

  // Optional contact linking
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<Id<"contacts"> | null>(null);
  const [selectedContactName, setSelectedContactName] = useState("");
  const [showContactList, setShowContactList] = useState(false);

  const contacts = useQuery(
    api.contacts.getByOrganization,
    organizationId ? { organizationId } : "skip"
  );

  const filteredContacts = contacts?.filter((c) => {
    if (!contactSearch.trim()) return false;
    const search = contactSearch.toLowerCase();
    const name = `${c.firstName} ${c.lastName || ""}`.toLowerCase();
    return name.includes(search) || (c.email?.toLowerCase().includes(search));
  }).slice(0, 6);

  useEffect(() => {
    if (open) {
      setTitle("");
      setLocation("");
      setContactSearch("");
      setSelectedContactId(null);
      setSelectedContactName("");
      setShowContactList(false);

      if (defaultDate) {
        const start = new Date(defaultDate);
        if (start.getHours() === 0 && start.getMinutes() === 0) {
          start.setHours(9, 0, 0, 0);
        }
        setStartDate(start);
        setEndDate(new Date(start.getTime() + 3600000));
      } else {
        const now = new Date();
        now.setMinutes(0, 0, 0);
        now.setHours(now.getHours() + 1);
        setStartDate(now);
        setEndDate(new Date(now.getTime() + 3600000));
      }

      // Default assignee to the current user
      setAssigneeId(userId || "");
    }
  }, [open, defaultDate, userId]);

  const effectiveUserId = assigneeId
    ? (assigneeId as Id<"users">)
    : userId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate || !effectiveUserId) return;

    await createAppt({
      organizationId,
      contactId: selectedContactId || undefined,
      title: title.trim(),
      appointmentDate: startDate.getTime(),
      endDate: endDate ? endDate.getTime() : undefined,
      location: location.trim() || undefined,
      type: "meeting" as const,
      assignedToUserId: effectiveUserId,
      createdByUserId: effectiveUserId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Appointment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Subject</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting with..."
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Start</Label>
            <DateTimePicker value={startDate} onChange={setStartDate} />
          </div>

          <div className="space-y-2">
            <Label>End</Label>
            <DateTimePicker value={endDate} onChange={setEndDate} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* Assignee */}
          {orgUsers && orgUsers.length > 0 && assigneeId && (
            <div className="space-y-2">
              <Label>Assigned to</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select user" />
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

          {/* Optional contact link */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Link to contact (optional)</Label>
            {selectedContactId ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-1.5">
                <span className="text-sm">{selectedContactName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setSelectedContactId(null);
                    setSelectedContactName("");
                    setContactSearch("");
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
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
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-40 overflow-auto">
                    {filteredContacts.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedContactId(c._id);
                          setSelectedContactName(`${c.firstName} ${c.lastName || ""}`.trim());
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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim() || !startDate || !effectiveUserId}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
