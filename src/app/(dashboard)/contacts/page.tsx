"use client";

import { useState, useEffect } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
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

  // Mobile view toggle — list vs detail. Below `lg` breakpoint only one is
  // visible at a time; on `lg+` the layout is the original 3-column view and
  // this state is ignored. Defaults to list so users see contacts first.
  const [activeMobileView, setActiveMobileView] = useState<"list" | "detail">("list");



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

  // Handle selecting a contact (for viewing).
  // On mobile we also flip to the detail view so the user sees the
  // communications pane immediately after picking a contact.
  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setActiveMobileView("detail");
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
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  // No organization selected
  if (!organization) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
              <Users className="h-6 w-6 text-on-surface-variant" />
            </div>
            <CardTitle>No Organization Selected</CardTitle>
            <CardDescription>
              Please select an organization to view contacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-on-surface-variant">
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
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4">
        <h1 className="text-lg font-extrabold tracking-tight">Contacts</h1>
        <p className="text-on-surface-variant">Manage your organization&apos;s contacts</p>
      </div>

      {/* 3-Column Layout (stacks to 1-column-with-tabs below lg) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Column 1: Contact List */}
        <div
          className={cn(
            "w-full lg:w-80 lg:flex-shrink-0 overflow-hidden h-full",
            activeMobileView === "list" ? "block" : "hidden lg:block",
          )}
        >
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
        <div
          className={cn(
            "flex-1 min-w-0 h-full overflow-hidden flex-col",
            activeMobileView === "detail" ? "flex" : "hidden lg:flex",
          )}
        >
          {/* Mobile-only back-to-list bar */}
          <button
            type="button"
            onClick={() => setActiveMobileView("list")}
            className="lg:hidden flex items-center gap-2 px-4 py-2 border-b text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to contacts
          </button>
          <div className="flex-1 min-h-0 overflow-hidden">
            <CommunicationsPane
              contact={selectedContact}
              organizationId={org._id}
            />
          </div>
        </div>

        {/* Column 3: Panel + Icon Menu */}
        <div
          className={cn(
            "flex flex-shrink-0",
            activeMobileView === "detail" ? "flex" : "hidden lg:flex",
          )}
        >
          {/* Panel content (expands when active) */}
          {activePanel && (activePanel === "sort" || selectedContact) && (
            <div className="w-80 overflow-y-auto">
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
          <div className="w-14 flex-shrink-0 bg-surface-container/30">
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
