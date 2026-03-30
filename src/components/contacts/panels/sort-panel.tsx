"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { X, ArrowUpDown, Search, Loader2, Phone, Mail, MapPin, Building2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { tagColors } from "@/lib/style-constants";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import type { SortField } from "../contact-side-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Contact = Doc<"contacts">;

const sortFields: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "streetAddress", label: "Street Address" },
  { field: "city", label: "City" },
  { field: "state", label: "State" },
  { field: "zip", label: "ZIP Code" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "tag", label: "Tag" },
];

function getFieldValue(contact: Contact, field: SortField): string {
  switch (field) {
    case "name":
      return `${contact.firstName} ${contact.lastName || ""}`.trim();
    case "streetAddress":
      return contact.streetAddress || "";
    case "city":
      return contact.city || "";
    case "state":
      return contact.state || "";
    case "zip":
      return contact.zipCode || "";
    case "email":
      return contact.email || "";
    case "phone": {
      const primary = contact.phoneNumbers.find((p) => p.isPrimary);
      return primary?.number || contact.phoneNumbers[0]?.number || "";
    }
    default:
      return "";
  }
}

function ContactRow({ contact, onSelect }: { contact: Contact; onSelect: () => void }) {
  const primaryPhone = contact.phoneNumbers.find((p) => p.isPrimary) || contact.phoneNumbers[0];
  const address = [contact.streetAddress, contact.city, contact.state, contact.zipCode]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      onClick={onSelect}
      className="flex gap-3 w-full px-3 py-3 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-left border-b border-border/40 last:border-0"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container text-xs font-semibold">
        {contact.firstName[0]}{contact.lastName?.[0] || ""}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="font-semibold">
          {contact.firstName} {contact.lastName || ""}
          {contact.company && (
            <span className="font-normal text-on-surface-variant ml-1.5 text-xs">
              <Building2 className="h-3 w-3 inline mr-0.5" />{contact.company}
            </span>
          )}
        </div>
        {primaryPhone && (
          <div className="text-xs text-on-surface-variant flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {formatPhoneDisplay(primaryPhone.number)}
          </div>
        )}
        {contact.email && (
          <div className="text-xs text-on-surface-variant flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {contact.email}
          </div>
        )}
        {address && (
          <div className="text-xs text-on-surface-variant flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {address}
          </div>
        )}
      </div>
    </button>
  );
}

interface SortPanelProps {
  organizationId: Id<"organizations">;
  onSelectContact: (contact: Contact) => void;
  onClose: () => void;
}

export function SortPanel({ organizationId, onSelectContact, onClose }: SortPanelProps) {
  // For non-tag fields: opens dialog immediately with all contacts sorted
  const [dialogField, setDialogField] = useState<SortField | null>(null);
  // For tag field: pick one or more tags in the tray, then open dialog
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [dialogSearch, setDialogSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");

  const contacts = useQuery(api.contacts.getByOrganization, { organizationId }) ?? [];
  const activeTags = useQuery(api.contactTags.getActive, { organizationId });

  // Count contacts per field (how many contacts have a value for this field)
  const fieldCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { field } of sortFields) {
      if (field === "tag") {
        counts[field] = contacts.filter((c) => c.tags && c.tags.length > 0).length;
      } else {
        counts[field] = contacts.filter((c) => getFieldValue(c, field) !== "").length;
      }
    }
    return counts;
  }, [contacts]);

  // Sorted contacts for dialog
  const sortedContacts = useMemo(() => {
    if (!dialogField) return [];
    const sorted = [...contacts].sort((a, b) => {
      const aVal = getFieldValue(a, dialogField).toLowerCase();
      const bVal = getFieldValue(b, dialogField).toLowerCase();
      return aVal.localeCompare(bVal);
    });
    if (!dialogSearch.trim()) return sorted;
    const q = dialogSearch.toLowerCase();
    return sorted.filter((c) => {
      const name = `${c.firstName} ${c.lastName || ""}`.toLowerCase();
      if (name.includes(q)) return true;
      if (getFieldValue(c, dialogField).toLowerCase().includes(q)) return true;
      return false;
    });
  }, [contacts, dialogField, dialogSearch]);

  // Contacts matching ALL selected tags
  const tagContacts = useMemo(() => {
    if (selectedTagIds.length === 0) return [];
    const matched = contacts.filter((c) =>
      selectedTagIds.every((tagId) => c.tags?.includes(tagId as Id<"contactTags">))
    );
    if (!dialogSearch.trim()) return matched;
    const q = dialogSearch.toLowerCase();
    return matched.filter((c) => {
      const name = `${c.firstName} ${c.lastName || ""}`.toLowerCase();
      return name.includes(q);
    });
  }, [contacts, selectedTagIds, dialogSearch]);

  // Tag counts
  const tagCounts = useMemo(() => {
    if (!activeTags) return [];
    return activeTags.map((tag) => ({
      tag,
      count: contacts.filter((c) => c.tags?.includes(tag._id)).length,
    }));
  }, [contacts, activeTags]);

  const filteredTagCounts = useMemo(() => {
    if (!tagSearch.trim()) return tagCounts;
    const q = tagSearch.toLowerCase();
    return tagCounts.filter(({ tag }) => tag.name.toLowerCase().includes(q));
  }, [tagCounts, tagSearch]);

  const handleFieldClick = (field: SortField) => {
    if (field === "tag") return; // Tag is handled differently in the tray
    setDialogField(field);
    setDialogSearch("");
  };

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleShowTagResults = () => {
    setShowTagDialog(true);
    setDialogSearch("");
  };

  const selectedTagNames = useMemo(() => {
    if (!activeTags) return "";
    return selectedTagIds
      .map((id) => activeTags.find((t) => t._id === id)?.name)
      .filter(Boolean)
      .join(" + ");
  }, [selectedTagIds, activeTags]);

  const isDialogOpen = dialogField !== null || showTagDialog;
  const dialogTitle = dialogField
    ? `Contacts by ${sortFields.find((f) => f.field === dialogField)?.label}`
    : `Tags: ${selectedTagNames}`;
  const dialogContacts = dialogField ? sortedContacts : tagContacts;

  if (contacts.length === 0 && !activeTags) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  // Show tag picker in tray
  const [showTagPicker, setShowTagPicker] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          {showTagPicker && (
            <button
              onClick={() => { setShowTagPicker(false); setTagSearch(""); }}
              className="flex items-center justify-center h-6 w-6 rounded-md hover:bg-surface-container-high transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ArrowUpDown className="h-4 w-4 text-on-surface-variant" />
          <h3 className="font-semibold text-sm">
            {showTagPicker ? "Select Tag" : "Sort By"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center h-6 w-6 rounded-md hover:bg-surface-container-high transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!showTagPicker ? (
        /* Field selection list */
        <ScrollArea className="flex-1">
          <div className="p-2">
            {sortFields.map(({ field, label }) => (
              <button
                key={field}
                onClick={() => {
                  if (field === "tag") {
                    setShowTagPicker(true);
                    setTagSearch("");
                  } else {
                    handleFieldClick(field);
                  }
                }}
                className="flex items-center justify-between w-full px-3 py-2.5 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <span>{label}</span>
                <span className="text-xs text-on-surface-variant">
                  {fieldCounts[field] ?? 0} contacts
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      ) : (
        /* Tag picker with multi-select */
        <>
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <Input
                placeholder="Search tags..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {filteredTagCounts.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-4">No tags found</p>
              ) : (
                filteredTagCounts.map(({ tag, count }) => {
                  const isSelected = selectedTagIds.includes(tag._id);
                  return (
                    <button
                      key={tag._id}
                      onClick={() => handleTagToggle(tag._id)}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors",
                        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <div className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span
                        className={cn(
                          "h-3.5 w-3.5 rounded-full shrink-0",
                          tagColors[tag.color]?.dot ?? "bg-gray-500"
                      )}
                    />
                      <span className="flex-1 text-left">{tag.name}</span>
                      <span className="text-xs text-on-surface-variant">{count}</span>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
          {/* Show Results button */}
          {selectedTagIds.length > 0 && (
            <div className="p-2 border-t">
              <button
                onClick={handleShowTagResults}
                className="w-full px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Show {selectedTagIds.length === 1 ? "1 tag" : `${selectedTagIds.length} tags`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Results dialog — shows for both field sort and tag filter */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogField(null);
            setShowTagDialog(false);
            setDialogSearch("");
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <Input
              placeholder="Search contacts..."
              value={dialogSearch}
              onChange={(e) => setDialogSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-0">
              {dialogContacts.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-4">No contacts found</p>
              ) : (
                <>
                  <p className="text-xs text-on-surface-variant px-3 pb-2">{dialogContacts.length} contact{dialogContacts.length !== 1 ? "s" : ""}</p>
                  {dialogContacts.map((contact) => (
                    <ContactRow
                      key={contact._id}
                      contact={contact}
                      onSelect={() => {
                        onSelectContact(contact);
                        setDialogField(null);
                        setShowTagDialog(false);
                        setDialogSearch("");
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
