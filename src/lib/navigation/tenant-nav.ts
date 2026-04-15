import {
  Phone, MessageSquare, Users, Calendar, BarChart3, TrendingUp,
  Workflow, Columns3, ClipboardCheck, FileSignature, Bot, Voicemail,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TenantRole = "agent" | "supervisor" | "tenant_admin";

export interface TenantNavItem {
  /** Display label in the nav bar */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tenant-level route (e.g. "/dashboard") */
  tenantPath: string;
  /** Admin tenant view sub-path (e.g. "" for root, "/sms" for sub-page).
   *  Prepended with `/admin/tenants/[id]` by the admin layout. */
  adminSubPath: string;
  /** Minimum role required to see this item.
   *  agent < supervisor < tenant_admin. undefined = all roles. */
  minRole?: TenantRole;
  /** Whether the tenant-level route actually exists.
   *  If false, only shown in admin tenant view (which has its own routes). */
  tenantRouteExists: boolean;
}

/**
 * Single source of truth for the tenant navigation menu.
 *
 * Consumed by:
 * - src/app/(dashboard)/layout.tsx — tenant top nav (filters by role + tenantRouteExists)
 * - src/app/(dashboard)/admin/tenants/[id]/page.tsx — admin inline nav (shows all)
 *
 * To add a new page: add the entry here, create the route, set tenantRouteExists=true.
 */
export const TENANT_NAV_ITEMS: TenantNavItem[] = [
  { label: "Calls",      icon: Phone,          tenantPath: "/dashboard",  adminSubPath: "",            tenantRouteExists: true },
  { label: "SMS",         icon: MessageSquare,  tenantPath: "/sms",        adminSubPath: "/sms",        tenantRouteExists: false },
  { label: "Contacts",    icon: Users,          tenantPath: "/contacts",   adminSubPath: "/contacts",   tenantRouteExists: true },
  { label: "Calendar",    icon: Calendar,       tenantPath: "/calendar",   adminSubPath: "/calendar",   tenantRouteExists: true },
  { label: "Tasks",       icon: ClipboardCheck, tenantPath: "/tasks",      adminSubPath: "/tasks",      tenantRouteExists: false },
  { label: "Reports",     icon: TrendingUp,     tenantPath: "/reports",    adminSubPath: "/reports",    minRole: "supervisor",    tenantRouteExists: true },
  { label: "Stats",       icon: BarChart3,      tenantPath: "/stats",      adminSubPath: "/stats",      tenantRouteExists: true },
  { label: "Workflows",   icon: Workflow,        tenantPath: "/workflows",  adminSubPath: "/workflows",  minRole: "supervisor",    tenantRouteExists: true },
  { label: "Pipelines",   icon: Columns3,       tenantPath: "/pipelines",  adminSubPath: "/pipelines",  minRole: "supervisor",    tenantRouteExists: false },
  { label: "E-Sign",      icon: FileSignature,  tenantPath: "/e-sign",     adminSubPath: "/e-sign",     tenantRouteExists: true },
  { label: "AI Agents",   icon: Bot,            tenantPath: "/ai-agents",  adminSubPath: "/agents",     minRole: "supervisor",    tenantRouteExists: false },
  { label: "Voicemails",  icon: Voicemail,       tenantPath: "/voicemails", adminSubPath: "/voicemails", tenantRouteExists: true },
];

const ROLE_RANK: Record<TenantRole, number> = {
  agent: 0,
  supervisor: 1,
  tenant_admin: 2,
};

/** Filter nav items by role and whether the tenant route exists. */
export function getTenantNavItems(role: TenantRole): TenantNavItem[] {
  const rank = ROLE_RANK[role] ?? 0;
  return TENANT_NAV_ITEMS.filter((item) => {
    if (!item.tenantRouteExists) return false;
    if (item.minRole && ROLE_RANK[item.minRole] > rank) return false;
    return true;
  });
}

/** Get all nav items for the admin tenant view (no filtering). */
export function getAdminTenantNavItems(): TenantNavItem[] {
  return TENANT_NAV_ITEMS;
}
