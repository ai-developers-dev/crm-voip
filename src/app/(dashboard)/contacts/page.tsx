"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc } from "../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users } from "lucide-react";
import { ContactListCompact } from "@/components/contacts/contact-list-compact";
import { CommunicationsPane } from "@/components/contacts/communications-pane";
import { ContactDetailsPlaceholder } from "@/components/contacts/contact-details-placeholder";
import { ContactDialog } from "@/components/contacts/contact-dialog";

type Contact = Doc<"contacts">;

export default function ContactsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

  // Dialog state (for create/edit)
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogContact, setDialogContact] = useState<Contact | null>(null);

  // Selected contact for viewing communications (separate from dialog)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Get internal org ID from Clerk org ID
  const org = useQuery(
    api.organizations.getByClerkId,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Get contacts for this organization
  const contacts = useQuery(
    api.contacts.getByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  // Handle selecting a contact (for viewing)
  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
  };

  const handleNewContact = () => {
    setDialogContact(null);
    setIsDialogOpen(true);
  };

  // Loading state
  if (!orgLoaded) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No organization selected
  if (!organization) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>No Organization Selected</CardTitle>
            <CardDescription>
              Please select an organization to view contacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            <p className="text-sm">
              Use the organization switcher in the header to select or create an organization.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading organization data
  if (org === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Organization not found in Convex
  if (org === null) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Organization Not Found</CardTitle>
            <CardDescription>
              Your organization has not been set up yet. Please contact support.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="text-muted-foreground">Manage your organization&apos;s contacts</p>
      </div>

      {/* 3-Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Column 1: Contact List */}
        <div className="w-80 border-r flex-shrink-0">
          <ContactListCompact
            contacts={contacts || []}
            selectedContactId={selectedContact?._id || null}
            onSelectContact={handleSelectContact}
            onNewContact={handleNewContact}
            isLoading={contacts === undefined}
          />
        </div>

        {/* Column 2: Communications Pane */}
        <div className="flex-1 min-w-0 border-r">
          <CommunicationsPane
            contact={selectedContact}
            organizationId={org._id}
          />
        </div>

        {/* Column 3: Reserved/Placeholder */}
        <div className="w-72 flex-shrink-0 bg-muted/30">
          <ContactDetailsPlaceholder />
        </div>
      </div>

      {/* Contact Dialog for create/edit */}
      <ContactDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        contact={dialogContact}
        organizationId={org._id}
      />
    </div>
  );
}
