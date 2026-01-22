"use client";

import { useState, useMemo } from "react";
import { Doc } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Phone,
  Mail,
  Building2,
  User,
  Loader2,
  Users,
} from "lucide-react";
import { formatPhoneDisplay } from "@/lib/utils/phone";

type Contact = Doc<"contacts">;

interface ContactListProps {
  contacts: Contact[];
  onSelectContact: (contact: Contact) => void;
  onNewContact: () => void;
  isLoading?: boolean;
}

export function ContactList({
  contacts,
  onSelectContact,
  onNewContact,
  isLoading = false,
}: ContactListProps) {
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

      // Search in email
      if (contact.email?.toLowerCase().includes(query)) return true;

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
        <div className="flex items-center justify-between p-4 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              className="pl-10"
              disabled
            />
          </div>
          <Button disabled className="ml-4">
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>

        {/* Loading skeleton */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading contacts...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with search and add button */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={onNewContact} className="ml-4">
          <Plus className="h-4 w-4 mr-2" />
          Add Contact
        </Button>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            {contacts.length === 0 ? (
              <>
                <h3 className="text-lg font-medium">No contacts yet</h3>
                <p className="text-muted-foreground mt-1 mb-4">
                  Add your first contact to get started.
                </p>
                <Button onClick={onNewContact}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium">No matches found</h3>
                <p className="text-muted-foreground mt-1">
                  Try a different search term.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {filteredContacts.map((contact) => (
              <Card
                key={contact._id}
                className="hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => onSelectContact(contact)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {/* Avatar placeholder */}
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-5 w-5" />
                      </div>

                      {/* Contact info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">
                            {contact.firstName} {contact.lastName}
                          </h4>
                          {contact.company && (
                            <Badge variant="secondary" className="text-xs">
                              <Building2 className="h-3 w-3 mr-1" />
                              {contact.company}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {getPrimaryPhone(contact)}
                          </span>
                          {contact.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {contact.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Phone type badges */}
                    <div className="flex gap-1">
                      {contact.phoneNumbers.length > 1 && (
                        <Badge variant="outline" className="text-xs">
                          {contact.phoneNumbers.length} phones
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Footer with count */}
      {contacts.length > 0 && (
        <div className="px-4 py-2 border-t text-sm text-muted-foreground">
          {filteredContacts.length === contacts.length
            ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`
            : `${filteredContacts.length} of ${contacts.length} contacts`}
        </div>
      )}
    </div>
  );
}
