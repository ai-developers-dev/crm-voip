"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Loader2 } from "lucide-react";
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas";

export default function NewWorkflowPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!convexOrg) return null;

  return <WorkflowCanvas organizationId={convexOrg._id} />;
}
