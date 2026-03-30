"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, ClipboardCheck, Phone, MessageSquare, Users, Calendar,
  BarChart3, Bot, Workflow, Columns3, Settings, CheckCircle, Clock,
  AlertCircle, User,
} from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export default function TenantTasksPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const [statusFilter, setStatusFilter] = useState("all");

  const tenant = useQuery(api.organizations.getById, {
    organizationId: tenantId as Id<"organizations">,
  });
  const tasks = useQuery(
    api.tasks.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );
  const users = useQuery(
    api.users.getByOrganization,
    tenant?._id ? { organizationId: tenant._id } : "skip"
  );
  const updateTask = useMutation(api.tasks.update);

  const filteredTasks = (tasks || []).filter((t) =>
    statusFilter === "all" ? true : t.status === statusFilter
  );

  const getUserName = (userId: string) => {
    const user = users?.find((u) => u._id === userId);
    return user?.name || "Unassigned";
  };

  if (!tenant) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height))] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height))]">
      {/* Nav */}
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
              <Button variant="ghost" size="sm" className="gap-2"><Users className="h-4 w-4" />Contacts</Button>
            </Link>
            <Link href={`/admin/tenants/${tenant._id}/calendar`}>
              <Button variant="ghost" size="sm" className="gap-2"><Calendar className="h-4 w-4" />Calendar</Button>
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
            <Link href={`/admin/tenants/${tenant._id}/tasks`}>
              <Button variant="secondary" size="sm" className="gap-2"><ClipboardCheck className="h-4 w-4" />Tasks</Button>
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

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
            <p className="text-sm text-on-surface-variant">{filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""} for {tenant.name}</p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!tasks ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" /></div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardCheck className="h-10 w-10 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">No tasks found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div key={task._id} className="flex items-center gap-3 border rounded-2xl px-4 py-3">
                {/* Status */}
                <Select
                  value={task.status}
                  onValueChange={(v) => updateTask({ id: task._id, status: v as any })}
                >
                  <SelectTrigger className="h-7 w-28 text-[11px] border-0 p-0 pl-2">
                    <Badge className={`${STATUS_COLORS[task.status]} text-[10px] px-1.5 py-0`}>
                      {task.status === "todo" ? "To Do" : task.status === "in_progress" ? "In Progress" : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>

                {/* Title + details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <Badge className={`${PRIORITY_COLORS[task.priority]} text-[10px] px-1.5 py-0`}>
                      {task.priority}
                    </Badge>
                    <span className="capitalize">{task.type.replace("_", " ")}</span>
                    {task.dueDate && (
                      <span className={task.dueDate < Date.now() ? "text-destructive font-medium" : ""}>
                        Due {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Assigned User — changeable */}
                <div className="shrink-0">
                  <Select
                    value={task.assignedToUserId}
                    onValueChange={(v) => updateTask({ id: task._id, assignedToUserId: v as any })}
                  >
                    <SelectTrigger className="h-8 text-xs w-36">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-on-surface-variant" />
                        <span className="truncate">{getUserName(task.assignedToUserId)}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {(users || []).map((u) => (
                        <SelectItem key={u._id} value={u._id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
