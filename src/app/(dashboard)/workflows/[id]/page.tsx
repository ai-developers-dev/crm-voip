"use client";

import { use } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas";

export default function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const workflow = useQuery(
    api.workflows.getById,
    id ? { id: id as Id<"workflows"> } : "skip"
  );

  if (!orgLoaded || convexOrg === undefined || workflow === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading workflow...</span>
        </div>
      </div>
    );
  }

  if (!convexOrg || !workflow) return null;

  return <WorkflowCanvas workflow={workflow} organizationId={convexOrg._id} />;
}
