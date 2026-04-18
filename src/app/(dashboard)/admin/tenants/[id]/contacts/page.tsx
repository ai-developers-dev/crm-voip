"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id, Doc } from "../../../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Loader2, Settings, Phone, MessageSquare, Users, Calendar, BarChart3, Bot, Workflow, Columns3, ClipboardCheck, FileSignature
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ContactListCompact } from "@/components/contacts/contact-list-compact";
import { CommunicationsPane } from "@/components/contacts/communications-pane";
import { ContactSideMenu, type PanelType } from "@/components/contacts/contact-side-menu";
import { ContactPanelDrawer } from "@/components/contacts/contact-panel-drawer";
import { ContactDialog } from "@/components/contacts/contact-dialog";

type Contact = Doc<"contacts">;

export default function TenantContactsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const tenantId = params.id as string;

  // Dialog state (for create/edit)
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogContact, setDialogContact] = useState<Contact | null>(null);

  // Selected contact for viewing communications (separate from dialog)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Active panel state for side menu
  const [activePanel, setActivePanel] = useState<PanelType | null>(null);

  // Check if user is a platform admin
  const isPlatformUser = useQuery(
    api.platformUsers.isPlatformUser,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  // Get the tenant organization by ID
  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  // Get contacts for this tenant
  const contacts = useQuery(
    api.contacts.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );

  // Get users in this tenant (for task assignment when admin creates tasks)
  const tenantUsers = useQuery(
    api.users.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );
  const fallbackUserId = tenantUsers?.[0]?._id;

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

  if (!userLoaded || isPlatformUser === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  // Only platform users can access this page
  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to view tenant dashboards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tenant === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (tenant === null) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Tenant Not Found</CardTitle>
            <CardDescription>
              The tenant organization you're looking for doesn't exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin">
              <Button className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Navigation Menu */}
      <div className="border-b bg-surface-container/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}>
              <Button variant="ghost" size="sm" className="gap-2"><Phone className="h-4 w-4" />Calls</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}>
              <Button variant="ghost" size="sm" className="gap-2"><MessageSquare className="h-4 w-4" />SMS</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}>
              <Button variant="ghost" size="sm" className="gap-2 border-b-2 border-primary rounded-none"><Users className="h-4 w-4" />Contacts</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}>
              <Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/tasks`}>
              <Button variant="ghost" size="sm" className="gap-2"><ClipboardCheck className="h-4 w-4" />Tasks</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}>
              <Button variant="ghost" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/workflows`}>
              <Button variant="ghost" size="sm" className="gap-2"><Workflow className="h-4 w-4" />Workflows</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/pipelines`}>
              <Button variant="ghost" size="sm" className="gap-2"><Columns3 className="h-4 w-4" />Pipelines</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/e-sign`}>
              <Button variant="ghost" size="sm" className="gap-2"><FileSignature className="h-4 w-4" />E-Sign</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/agents`}>
              <Button variant="ghost" size="sm" className="gap-2"><Bot className="h-4 w-4" />AI Agents</Button>
            </Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}>
            <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings</Button>
          </Link>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Column 1: Contact List */}
        <div className="w-80 flex-shrink-0">
          <ContactListCompact
            contacts={contacts || []}
            selectedContactId={selectedContact?._id || null}
            onSelectContact={handleSelectContact}
            onNewContact={handleNewContact}
            onEditContact={handleEditContact}
            onDeleteContact={handleDeleteContact}
            isLoading={contacts === undefined}
            organizationId={tenant?._id}
          />
        </div>

        {/* Column 2: Communications Pane */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          <CommunicationsPane
            contact={selectedContact}
            organizationId={tenant._id}
          />
        </div>

        {/* Column 3: Panel + Icon Menu */}
        <div className="flex flex-shrink-0 h-full overflow-hidden">
          {activePanel && (activePanel === "sort" || selectedContact) && (
            <div className="w-80 h-full flex flex-col">
              <ContactPanelDrawer
                type={activePanel}
                contact={selectedContact}
                organizationId={tenant._id}
                userId={fallbackUserId}
                isAdmin={true}
                onClose={() => setActivePanel(null)}
                onSelectContact={handleSelectContact}
              />
            </div>
          )}
          <div className="w-14 flex-shrink-0 bg-surface-container/30">
            <ContactSideMenu
              activePanel={activePanel}
              onPanelChange={(panel) => {
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
        organizationId={tenant._id}
      />
    </div>
  );
}
