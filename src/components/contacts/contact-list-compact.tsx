"use client";

import { useState, useMemo } from "react";
import { Doc } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Phone, User, Loader2, Users, ChevronDown, Mail, Building2, MapPin, Pencil, Trash2 } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import { cn } from "@/lib/utils";

type Contact = Doc<"contacts">;

interface ContactListCompactProps {
  contacts: Contact[];
  selectedContactId: string | null;
  onSelectContact: (contact: Contact) => void;
  onNewContact: () => void;
  onEditContact?: (contact: Contact) => void;
  onDeleteContact?: (contact: Contact) => void;
  isLoading?: boolean;
}

function ContactCard({
  contact,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  getPrimaryPhone,
}: {
  contact: Contact;
  isSelected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  getPrimaryPhone: (c: Contact) => string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const address = [contact.streetAddress, contact.city, contact.state, contact.zipCode]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "rounded-md transition-colors relative",
        isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5 p-2.5">
        <button
          onClick={onSelect}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              isSelected ? "bg-primary/20" : "bg-muted"
            )}
          >
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {contact.firstName} {contact.lastName}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" />
              <span className="truncate">{getPrimaryPhone(contact)}</span>
            </p>
          </div>
        </button>

        {/* Edit / Delete - aligned with name */}
        {isExpanded && (onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-1.5 rounded text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && !showDeleteConfirm && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {isExpanded && showDeleteConfirm && (
        <div className="flex items-center justify-end gap-1.5 px-2.5 pb-1">
          <span className="text-[12px] text-destructive">Delete contact?</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="text-[12px] px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
            className="text-[12px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Expand arrow - visible on hover or when expanded */}
      <div
        className={cn(
          "flex justify-center transition-all duration-200",
          isHovered || isExpanded ? "opacity-100 h-5" : "opacity-0 h-0 overflow-hidden"
        )}
      >
        <button
          onClick={handleExpandClick}
          className="flex items-center justify-center w-8 h-5 rounded-b-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Expanded details */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          isExpanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-3 pb-3 pt-1 border-t border-border/40 mx-2.5">
          <div className="space-y-1.5 text-[14px]">
            {/* All phone numbers */}
            {contact.phoneNumbers.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{formatPhoneDisplay(p.number)}</span>
                <span className="text-[11px] uppercase tracking-wide opacity-60">{p.type}</span>
                {p.isPrimary && (
                  <span className="text-[11px] bg-primary/10 text-primary px-1 rounded">primary</span>
                )}
              </div>
            ))}

            {/* Email */}
            {contact.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}

            {/* Company */}
            {contact.company && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{contact.company}</span>
              </div>
            )}

            {/* Address */}
            {address && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{address}</span>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[12px] px-2.5 py-1 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    Maps
                  </a>
                  <a
                    href={`https://www.zillow.com/homes/${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[12px] px-2.5 py-1 rounded bg-muted hover:bg-blue-500/10 hover:text-blue-600 transition-colors"
                  >
                    Zillow
                  </a>
                </div>
              </div>
            )}

            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[12px] bg-muted px-1.5 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContactListCompact({
  contacts,
  selectedContactId,
  onSelectContact,
  onNewContact,
  onEditContact,
  onDeleteContact,
  isLoading = false,
}: ContactListCompactProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) {
      return contacts;
    }

    const query = searchQuery.toLowerCase();
    return contacts.filter((contact) => {
      const fullName = `${contact.firstName} ${contact.lastName || ""}`.toLowerCase();
      if (fullName.includes(query)) return true;
      if (contact.company?.toLowerCase().includes(query)) return true;
      const queryDigits = query.replace(/\D/g, "");
      if (queryDigits.length >= 3) {
        const hasMatchingPhone = contact.phoneNumbers.some((p) =>
          p.number.replace(/\D/g, "").includes(queryDigits)
        );
        if (hasMatchingPhone) return true;
      }
      return false;
    });
  }, [contacts, searchQuery]);

  // Get primary phone for display
  const getPrimaryPhone = (contact: Contact): string => {
    const primary = contact.phoneNumbers.find((p) => p.isPrimary);
    return primary ? formatPhoneDisplay(primary.number) : formatPhoneDisplay(contact.phoneNumbers[0]?.number || "");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-8 h-9" disabled />
          </div>
          <Button disabled className="w-full h-9" size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Contact
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button onClick={onNewContact} className="w-full h-9" size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Contact
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-2">
              <div className="rounded-full bg-muted p-3 mb-3">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts yet</p>
              ) : (
                <p className="text-sm text-muted-foreground">No matches</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredContacts.map((contact) => (
                <ContactCard
                  key={contact._id}
                  contact={contact}
                  isSelected={selectedContactId === contact._id}
                  onSelect={() => onSelectContact(contact)}
                  onEdit={onEditContact ? () => onEditContact(contact) : undefined}
                  onDelete={onDeleteContact ? () => onDeleteContact(contact) : undefined}
                  getPrimaryPhone={getPrimaryPhone}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="px-3 py-2 border-t text-xs text-muted-foreground text-center">
        {filteredContacts.length === contacts.length
          ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`
          : `${filteredContacts.length} of ${contacts.length}`}
      </div>
    </div>
  );
}
