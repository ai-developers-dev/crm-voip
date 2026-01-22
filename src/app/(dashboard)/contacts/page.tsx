"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc } from "../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users } from "lucide-react";
import { ContactList } from "@/components/contacts/contact-list";
import { ContactDialog } from "@/components/contacts/contact-dialog";

type Contact = Doc<"contacts">;

export default function ContactsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDialogOpen(true);
  };

  const handleNewContact = () => {
    setSelectedContact(null);
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

      {/* Contacts Content */}
      <div className="flex-1 overflow-hidden">
        <ContactList
          contacts={contacts || []}
          onSelectContact={handleSelectContact}
          onNewContact={handleNewContact}
          isLoading={contacts === undefined}
        />
      </div>

      {/* Contact Dialog */}
      <ContactDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        contact={selectedContact}
        organizationId={org._id}
      />
    </div>
  );
}
