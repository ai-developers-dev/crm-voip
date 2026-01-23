"use client";

import { useState, useMemo } from "react";
import { Doc } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Phone, User, Loader2, Users } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/utils/phone";
import { cn } from "@/lib/utils";

type Contact = Doc<"contacts">;

interface ContactListCompactProps {
  contacts: Contact[];
  selectedContactId: string | null;
  onSelectContact: (contact: Contact) => void;
  onNewContact: () => void;
  isLoading?: boolean;
}

export function ContactListCompact({
  contacts,
  selectedContactId,
  onSelectContact,
  onNewContact,
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
      // Search in name
      const fullName = `${contact.firstName} ${contact.lastName || ""}`.toLowerCase();
      if (fullName.includes(query)) return true;

      // Search in company
      if (contact.company?.toLowerCase().includes(query)) return true;

      // Search in phone numbers (digits only)
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
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

        {/* Loading */}
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with search and add button */}
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

      {/* Contact list */}
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
                <button
                  key={contact._id}
                  onClick={() => onSelectContact(contact)}
                  className={cn(
                    "w-full flex items-center gap-2.5 p-2.5 rounded-md text-left transition-colors",
                    selectedContactId === contact._id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/50"
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      selectedContactId === contact._id
                        ? "bg-primary/20"
                        : "bg-muted"
                    )}
                  >
                    <User className="h-4 w-4" />
                  </div>

                  {/* Info */}
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
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer with count */}
      <div className="px-3 py-2 border-t text-xs text-muted-foreground text-center">
        {filteredContacts.length === contacts.length
          ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`
          : `${filteredContacts.length} of ${contacts.length}`}
      </div>
    </div>
  );
}
