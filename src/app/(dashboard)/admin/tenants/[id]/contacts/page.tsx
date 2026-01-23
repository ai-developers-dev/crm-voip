"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id, Doc } from "../../../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Eye, Loader2, Settings, Phone, MessageSquare, Users, Calendar, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ContactListCompact } from "@/components/contacts/contact-list-compact";
import { CommunicationsPane } from "@/components/contacts/communications-pane";
import { ContactDetailsPlaceholder } from "@/components/contacts/contact-details-placeholder";
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

  // Handle selecting a contact (for viewing)
  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
  };

  const handleNewContact = () => {
    setDialogContact(null);
    setIsDialogOpen(true);
  };

  if (!userLoaded || isPlatformUser === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Only platform users can access this page
  if (!isPlatformUser) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
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
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenant === null) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Impersonation Banner */}
      <Alert className="rounded-none border-x-0 border-t-0 bg-amber-500/10 border-amber-500/20">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-400">
            <strong>Viewing as:</strong> {tenant.name} ({tenant.plan} plan)
          </span>
          <Link href="/admin">
            <Button variant="outline" size="sm" className="border-amber-500/30 hover:bg-amber-500/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </AlertDescription>
      </Alert>

      {/* Navigation Menu */}
      <div className="border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            <Link href={`/admin/tenants/${tenant._id}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Phone className="h-4 w-4" />
                Calls
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/sms`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/contacts`}>
              <Button variant="secondary" size="sm" className="gap-2">
                <Users className="h-4 w-4" />
                Contacts
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                Calendar
              </Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/reports`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Reports
              </Button>
            </Link>
          </nav>
          <Link href={`/admin/tenants/${tenant._id}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
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
            organizationId={tenant._id}
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
        organizationId={tenant._id}
      />
    </div>
  );
}
