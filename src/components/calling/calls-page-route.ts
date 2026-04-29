"use client";

import { usePathname } from "next/navigation";

/**
 * True iff the current route is THE Calls page itself —
 * i.e. /dashboard or /admin/tenants/[id] — and NOT any of its
 * sub-routes (e.g. /admin/tenants/[id]/sms, /admin/tenants/[id]/contacts).
 *
 * Used to hide global call UI (ActiveCallBar, GlobalIncomingBanner)
 * on the Calls page where the same controls are already rendered
 * inline in each user's card.
 *
 * Pre-fix: `pathname?.startsWith("/admin/tenants/")` matched every
 * tenant sub-route, so the global bar was hidden everywhere when
 * viewing a tenant. Centralising the rule here keeps the two
 * call-UI components from drifting again.
 */
export function useIsCallsPage(): boolean {
  const pathname = usePathname();
  if (pathname === "/dashboard") return true;
  return /^\/admin\/tenants\/[^/]+\/?$/.test(pathname ?? "");
}
