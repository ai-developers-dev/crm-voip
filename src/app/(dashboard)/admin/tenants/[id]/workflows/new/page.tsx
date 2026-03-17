"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas";

export default function TenantNewWorkflowPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const tenant = useQuery(
    api.organizations.getById,
    tenantId ? { organizationId: tenantId as Id<"organizations"> } : "skip"
  );

  if (tenant === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span>Loading...</span></div>
      </div>
    );
  }

  if (!tenant) return null;

  return (
    <WorkflowCanvas
      organizationId={tenant._id}
      basePath={`/admin/tenants/${tenant._id}/workflows`}
    />
  );
}
