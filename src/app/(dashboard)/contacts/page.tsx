"use client";

import { useState, useEffect } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users } from "lucide-react";
import { ContactListCompact } from "@/components/contacts/contact-list-compact";
import { CommunicationsPane } from "@/components/contacts/communications-pane";
import { ContactSideMenu, type PanelType } from "@/components/contacts/contact-side-menu";
import { ContactPanelDrawer } from "@/components/contacts/contact-panel-drawer";
import { ContactDialog } from "@/components/contacts/contact-dialog";

type Contact = Doc<"contacts">;

export default function ContactsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user } = useUser();
  const searchParams = useSearchParams();
  const contactIdParam = searchParams.get("id");
  const panelParam = searchParams.get("panel");

  // Dialog state (for create/edit)
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogContact, setDialogContact] = useState<Contact | null>(null);

  // Selected contact for viewing communications (separate from dialog)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Active panel state for side menu
  const [activePanel, setActivePanel] = useState<PanelType | null>(null);



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

  // Auto-select contact and open panel from URL params (e.g., from notification click)
  useEffect(() => {
    if (contactIdParam && contacts && !selectedContact) {
      const match = contacts.find((c) => c._id === contactIdParam);
      if (match) {
        setSelectedContact(match);
        if (panelParam) {
          setActivePanel(panelParam as PanelType);
        }
      }
    }
  }, [contactIdParam, panelParam, contacts, selectedContact]);

  // Get current user for panel operations
  const currentUser = useQuery(
    api.users.getByClerkId,
    user?.id && org?._id ? { clerkUserId: user.id, organizationId: org._id } : "skip"
  );

  // Check if platform admin
  const isPlatformAdmin = useQuery(
    api.platformUsers.isSuperAdmin,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const isAdmin = isPlatformAdmin || currentUser?.role === "tenant_admin";

  // Handle selecting a contact (for viewing)
  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
  };

  const handleNewContact = () => {
    setDialogContact(null);
    setIsDialogOpen(true);
  };

  const handleEditContact = (contact: Contact) => {
    setDialogContact(contact);
    setIsDialogOpen(true);
  };

  const deleteContact = useMutation(api.contacts.remove);
  const handleDeleteContact = async (contact: Contact) => {
    await deleteContact({ contactId: contact._id });
    if (selectedContact?._id === contact._id) {
      setSelectedContact(null);
    }
  };

  // Loading state
  if (!orgLoaded) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No organization selected
  if (!organization) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
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
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Organization not found in Convex
  if (org === null) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
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
    <div className="flex flex-col h-[calc(100vh-var(--header-height))]">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">Manage your organization&apos;s contacts</p>
      </div>

      {/* 3-Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Column 1: Contact List */}
        <div className="w-80 border-r flex-shrink-0 overflow-hidden h-full">
          <ContactListCompact
            contacts={contacts || []}
            selectedContactId={selectedContact?._id || null}
            onSelectContact={handleSelectContact}
            onNewContact={handleNewContact}
            onEditContact={handleEditContact}
            onDeleteContact={handleDeleteContact}
            isLoading={contacts === undefined}
            organizationId={org?._id}
          />
        </div>

        {/* Column 2: Communications Pane */}
        <div className="flex-1 min-w-0 border-r">
          <CommunicationsPane
            contact={selectedContact}
            organizationId={org._id}
          />
        </div>

        {/* Column 3: Panel + Icon Menu */}
        <div className="flex flex-shrink-0">
          {/* Panel content (expands when active) */}
          {activePanel && (activePanel === "sort" || selectedContact) && (
            <div className="w-80 border-r overflow-y-auto">
              <ContactPanelDrawer
                type={activePanel}
                contact={selectedContact}
                organizationId={org._id}
                userId={currentUser?._id}
                isAdmin={!!isAdmin}
                onClose={() => setActivePanel(null)}
                onSelectContact={handleSelectContact}
              />
            </div>
          )}

          {/* Icon menu strip (always visible, right edge) */}
          <div className="w-14 border-l flex-shrink-0 bg-muted/30">
            <ContactSideMenu
              activePanel={activePanel}
              onPanelChange={(panel) => {
                // For sort, always allow toggle. For others, require selected contact.
                if (panel !== "sort" && !selectedContact) return;
                setActivePanel(activePanel === panel ? null : panel);
              }}
            />
          </div>
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
